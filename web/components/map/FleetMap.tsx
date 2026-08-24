"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { DeviceListItem } from "../../lib/types";
import { lerpLatLng, type LatLng } from "../../lib/map/interpolate";
import { buildPopupContent } from "./popup-content";
import { bearing, createVehicleMarkerElement, hasMoved, type VehicleMarkerElement } from "./vehicle-marker";

const STYLE_URL = "https://tiles.openfreemap.org/styles/liberty";
// Matches the backend's position-broadcast throttle (see
// backend/src/ws/telemetry.gateway.ts, POSITION_THROTTLE_MS) - updates arrive
// roughly this often, so animating over the same span keeps motion continuous.
const ANIMATION_DURATION_MS = 1000;

const STATUS_COLOR_VAR: Record<DeviceListItem["connectivityStatus"], string> = {
  online: "var(--status-online)",
  stale: "var(--status-stale)",
  offline: "var(--status-offline)",
};

interface AnimatedPoint {
  from: LatLng;
  to: LatLng;
  startedAt: number;
}

interface TrackedMarker {
  marker: maplibregl.Marker;
  controls: VehicleMarkerElement;
  lastPos: LatLng;
  heading: number;
}

export interface FleetMapProps {
  devices: DeviceListItem[];
  selectedDeviceId: string | null;
}

function deviceFeatureProperties(device: DeviceListItem) {
  return {
    id: device.id,
    publicId: device.publicId,
    plate: device.plate,
    speedKph: device.latestReading?.speedKph ?? 0,
    fuelLiters: device.latestReading?.fuelLiters ?? 0,
    connectivityStatus: device.connectivityStatus,
  };
}

export function FleetMap({ devices, selectedDeviceId }: FleetMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  // State (not a ref) on purpose: the fly-to/popup effect below needs to
  // re-run once loading flips true even when selectedDeviceId hasn't changed
  // since mount - e.g. the device-detail page, which renders FleetMap with a
  // selectedDeviceId already set before the map's async "load" event fires.
  const [loaded, setLoaded] = useState(false);
  const animatedRef = useRef(new Map<string, AnimatedPoint>());
  const devicesRef = useRef<DeviceListItem[]>(devices);
  const markersRef = useRef(new Map<string, TrackedMarker>());
  const selectedIdRef = useRef<string | null>(selectedDeviceId);
  // Which selectedDeviceId the initial flyTo has already run for - lets the
  // effect below tell "first time selecting this vehicle" (zoom in) apart
  // from "same vehicle, newer reading" (pan only, keep the user's zoom).
  const flownForRef = useRef<string | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: [0, 0],
      zoom: 2,
    });
    mapRef.current = map;

    map.on("load", () => {
      setLoaded(true);

      let raf: number;
      const tick = () => {
        const now = performance.now();
        for (const device of devicesRef.current) {
          const anim = animatedRef.current.get(device.id);
          const tracked = markersRef.current.get(device.id);
          if (!anim || !tracked) continue;

          const t = (now - anim.startedAt) / ANIMATION_DURATION_MS;
          const pos = lerpLatLng(anim.from, anim.to, t);
          tracked.marker.setLngLat([pos.lng, pos.lat]);

          if (hasMoved(tracked.lastPos, pos)) {
            tracked.heading = bearing(tracked.lastPos, pos);
            tracked.controls.setHeading(tracked.heading);
          }
          tracked.lastPos = pos;
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);

      map.once("remove", () => cancelAnimationFrame(raf));
    });

    const markers = markersRef.current;
    return () => {
      markers.forEach(({ marker }) => marker.remove());
      markers.clear();
      map.remove();
      mapRef.current = null;
      setLoaded(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Feed new positions into the animation targets, and create/remove marker
  // elements to match, whenever the device set or their readings update.
  useEffect(() => {
    devicesRef.current = devices;
    const map = mapRef.current;
    if (!map || !loaded) return;

    const seenIds = new Set<string>();

    for (const device of devices) {
      const reading = device.latestReading;
      if (!reading) continue;
      seenIds.add(device.id);
      const target: LatLng = { lat: reading.lat, lng: reading.lng };
      const existingAnim = animatedRef.current.get(device.id);

      if (!existingAnim) {
        animatedRef.current.set(device.id, { from: target, to: target, startedAt: performance.now() });
      } else if (existingAnim.to.lat !== target.lat || existingAnim.to.lng !== target.lng) {
        const now = performance.now();
        const elapsed = (now - existingAnim.startedAt) / ANIMATION_DURATION_MS;
        const currentDisplayed = lerpLatLng(existingAnim.from, existingAnim.to, elapsed);
        animatedRef.current.set(device.id, { from: currentDisplayed, to: target, startedAt: now });
      }

      let tracked = markersRef.current.get(device.id);
      if (!tracked) {
        const controls = createVehicleMarkerElement();
        controls.el.addEventListener("click", (event) => {
          event.stopPropagation();
          const current = devicesRef.current.find((d) => d.id === device.id);
          if (current) showPopup(map, deviceFeatureProperties(current), tracked!.lastPos);
        });
        const marker = new maplibregl.Marker({ element: controls.el, anchor: "center" })
          .setLngLat([target.lng, target.lat])
          .addTo(map);
        tracked = { marker, controls, lastPos: target, heading: 0 };
        markersRef.current.set(device.id, tracked);
      }
      tracked.controls.setColor(STATUS_COLOR_VAR[device.connectivityStatus]);
      tracked.controls.setSelected(device.id === selectedIdRef.current);
    }

    for (const [id, tracked] of markersRef.current) {
      if (!seenIds.has(id)) {
        tracked.marker.remove();
        markersRef.current.delete(id);
        animatedRef.current.delete(id);
      }
    }
  }, [devices, loaded]);

  // Fly to + popup the first time a vehicle is selected (zooms in). Single-
  // vehicle callers (the device detail page) also get a camera that follows
  // on every later reading via easeTo (pan only, keeps the zoom) - otherwise
  // the one-shot flyTo below locks onto one snapshot and the vehicle just
  // drives off-screen as new readings arrive. Fleet view (many devices)
  // deliberately skips that follow-up: re-centering on every tick there
  // would fight the user panning the map.
  const soleDevice = devices.length === 1 ? devices[0] : null;
  const trackedDevice = soleDevice ?? devices.find((d) => d.id === selectedDeviceId) ?? null;
  const trackedReadingKey = trackedDevice?.latestReading?.recordedAt ?? null;

  useEffect(() => {
    selectedIdRef.current = selectedDeviceId;
    markersRef.current.forEach((tracked, id) => tracked.controls.setSelected(id === selectedDeviceId));

    const map = mapRef.current;
    if (!map || !selectedDeviceId || !loaded) return;
    const device = devices.find((d) => d.id === selectedDeviceId);
    const reading = device?.latestReading;
    if (!device || !reading) return;

    if (flownForRef.current !== selectedDeviceId) {
      flownForRef.current = selectedDeviceId;
      map.flyTo({ center: [reading.lng, reading.lat], zoom: 14 });
    } else if (soleDevice) {
      // Explicit zoom, matching the flyTo above: a follow-up reading can
      // arrive before that flyTo's animation finishes, and an easeTo with no
      // zoom keeps whatever zoom was mid-flight at that instant - locking the
      // camera at an interrupted, half-zoomed-out state instead of settling
      // on 14 like the first jump intended.
      map.easeTo({ center: [reading.lng, reading.lat], zoom: 14, duration: 500 });
    }
    showPopup(map, deviceFeatureProperties(device), { lat: reading.lat, lng: reading.lng });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDeviceId, loaded, trackedReadingKey]);

  function showPopup(map: MapLibreMap, properties: ReturnType<typeof deviceFeatureProperties>, pos: LatLng) {
    popupRef.current?.remove();
    const content = buildPopupContent(properties);
    popupRef.current = new maplibregl.Popup({ closeButton: true, className: "vehicle-popup-wrap", offset: 18 })
      .setLngLat([pos.lng, pos.lat])
      .setDOMContent(content)
      .addTo(map);
  }

  return <div ref={containerRef} style={{ width: "100%", height: "100%" }} />;
}
