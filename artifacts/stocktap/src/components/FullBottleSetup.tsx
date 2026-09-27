import { useState } from "react";
import { Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NumberPad } from "@/components/NumberPad";
import { useToast } from "@/hooks/use-toast";
import { useCalibrateFullBottle, useUpdateProduct } from "@/hooks/api";

type Props = {
  product: { id: string; name: string; size_ml: number | null; density: number | null; location_id: string | null; type?: string | null; empty_weight_g?: number | null };
  venueId: string;
  userId: string;
  /** Called once the full weight is saved and the product can be weighed. */
  onDone?: () => void;
  /** The person has no full bottle to hand and wants to count in tenths. */
  onUseTenths: () => void;
  /** Line is counted in tenths today: after weighing, switch it to counting by weight. */
  switchToWeigh?: boolean;
  /** Wording for the "not now" link. */
  useTenthsLabel?: string;
};

/**
 * Shown when a line is set to "weigh" but has no bottle weights yet. One sealed
 * full bottle on the scale is enough: StockTap works out the empty weight from the
 * drink's density, saves it for this venue and adds it to the shared bottle
 * database so the next pub gets it for free.
 */
export function FullBottleSetup({ product, venueId, userId, onDone, onUseTenths, switchToWeigh, useTenthsLabel }: Props) {
  const [weightStr, setWeightStr] = useState("0");
  const calibrate = useCalibrateFullBottle();
  const updateProduct = useUpdateProduct();
  const { toast } = useToast();
  const weightG = parseFloat(weightStr) || 0;

  const save = async () => {
    try {
      await calibrate.mutateAsync({ product, venueId, userId, weightG });
      if (switchToWeigh) await updateProduct.mutateAsync({ id: product.id, venue_id: venueId, counting_method: "weigh" });
      toast({ title: "Bottle set up", description: `${product.name}: now weigh the open bottle.` });
      setWeightStr("0");
      onDone?.();
    } catch (err: any) {
      toast({ title: "Check that weight", description: String(err?.message ?? err), variant: "destructive" });
    }
  };

  return (
    <div className="rounded-xl border border-[#E0A343]/40 bg-[#E0A343]/10 p-4 space-y-3" data-testid="full-bottle-setup">
      <div className="flex items-start gap-3">
        <Scale className="w-5 h-5 text-[#E0A343] shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-sm">We don't have this bottle's weight yet</p>
          <p className="text-xs text-muted-foreground">
            Put one <strong>full, sealed</strong> {product.name} on the scale and type the grams. You only do this once, then you can weigh the open bottle.
          </p>
        </div>
      </div>
      <NumberPad value={weightStr} onChange={setWeightStr} label="Full sealed bottle (grams)" allowDecimal />
      <Button type="button" className="w-full h-12 font-bold" onClick={save} disabled={weightG <= 0 || calibrate.isPending || updateProduct.isPending} data-testid="button-save-full-weight">
        {calibrate.isPending ? "Saving..." : "Save full bottle weight"}
      </Button>
      <button type="button" className="text-sm underline text-primary w-full" onClick={onUseTenths} data-testid="button-use-tenths">
        No full bottle to hand? Count this one in tenths
      </button>
    </div>
  );
}
