import { DeviceDetailView } from "../../../../components/devices/DeviceDetailView";

export default function DeviceDetailPage({ params }: { params: { id: string } }) {
  return <DeviceDetailView deviceId={params.id} />;
}
