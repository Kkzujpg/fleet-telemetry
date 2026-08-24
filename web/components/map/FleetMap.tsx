"use client";

import { useEffect, useRef, useState } from "react";
import maplibregl, { Map as MapLibreMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { DeviceListItem } from "../../lib/types";
import { lerpLatLng, type LatLng } from "../../lib/map/interpolate";
import { buildPopupContent } from "./popup-content";
import { bearing, createVehicleMarkerElement, hasMoved, type VehicleMarkerElement } from "./vehicle-marker";

const STYLE_URL = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
// Coincide con el throttle de broadcast de posición del backend (ver
// backend/src/ws/telemetry.gateway.ts, POSITION_THROTTLE_MS) - las
// actualizaciones llegan aproximadamente con esta frecuencia, así que animar
// sobre el mismo lapso mantiene el movimiento continuo.
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
  // State (no ref) a propósito: el efecto de fly-to/popup de abajo necesita
  // volver a correr una vez que loading pasa a true aunque selectedDeviceId
  // no haya cambiado desde el mount - ej: la página de detalle de device,
  // que renderiza FleetMap con un selectedDeviceId ya seteado antes de que
  // dispare el evento async "load" del mapa.
  const [loaded, setLoaded] = useState(false);
  const animatedRef = useRef(new Map<string, AnimatedPoint>());
  const devicesRef = useRef<DeviceListItem[]>(devices);
  const markersRef = useRef(new Map<string, TrackedMarker>());
  const selectedIdRef = useRef<string | null>(selectedDeviceId);
  // Para qué selectedDeviceId ya corrió el flyTo inicial - permite que el
  // efecto de abajo distinga "primera vez seleccionando este vehículo"
  // (hacer zoom) de "mismo vehículo, lectura más nueva" (solo pan,
  // manteniendo el zoom del usuario).
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

  // Alimenta las nuevas posiciones a los targets de animación, y
  // crea/elimina elementos marker en consecuencia, cada vez que cambia el
  // conjunto de devices o sus lecturas.
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

  // Fly to + popup la primera vez que se selecciona un vehículo (hace zoom).
  // Los llamadores de un solo vehículo (la página de detalle de device)
  // también obtienen una cámara que sigue cada lectura posterior vía easeTo
  // (solo pan, mantiene el zoom) - si no, el flyTo de una sola vez de abajo
  // queda fijo en un snapshot y el vehículo se sale de pantalla a medida que
  // llegan nuevas lecturas. La vista de flota (muchos devices) omite ese
  // seguimiento a propósito: re-centrar en cada tick ahí pelearía con el
  // usuario paneando el mapa.
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
      // Zoom explícito, igual al flyTo de arriba: una lectura posterior puede
      // llegar antes de que termine la animación de ese flyTo, y un easeTo
      // sin zoom mantendría el zoom que estuviera a mitad de vuelo en ese
      // instante - dejando la cámara en un estado interrumpido y a medio
      // alejar en vez de asentarse en 14 como pretendía el salto inicial.
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
