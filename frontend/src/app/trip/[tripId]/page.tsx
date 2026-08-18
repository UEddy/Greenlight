import { isHex } from "viem";
import { TripScreen } from "@/components/TripScreen";

/**
 * The trip screen, and the target of every sponsor link.
 *
 * No wallet is needed to read it. A sponsor arriving from a shared link sees
 * the status, the balance and the deadline before being asked to connect
 * anything.
 */
export default async function Page({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;

  if (!isHex(tripId) || tripId.length !== 66) {
    return (
      <div className="border border-[var(--color-ink-line)] bg-[var(--color-ink-raised)] p-6">
        <h1 className="text-lg font-semibold text-[#e8ecf4]">That is not a trip id</h1>
        <p className="mt-2 text-sm leading-relaxed text-[#b8c4d8]">
          A trip id is 32 bytes of hex, starting with 0x. Check the link you
          were sent, or start a trip at /trip.
        </p>
      </div>
    );
  }

  return <TripScreen tripId={tripId} />;
}
