import { useSetProductHidden } from "@/hooks/api";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";

/** One tap to hide a line the pub doesn't stock, with Undo. Works offline. */
export function useQuickHide(venueId: string | undefined) {
  const setHidden = useSetProductHidden();
  const { toast } = useToast();
  return (p: { id: string; name: string }) => {
    if (!venueId) return;
    setHidden.mutate({ id: p.id, venue_id: venueId, hidden: true });
    toast({
      title: `${p.name} hidden`,
      description: "Off your counts. Library › Hidden lines brings it back.",
      action: (
        <ToastAction altText="Undo" data-testid="button-undo-hide" onClick={() => setHidden.mutate({ id: p.id, venue_id: venueId, hidden: false })}>
          Undo
        </ToastAction>
      ),
    });
  };
}
