import React, { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocations, useProducts, useSpecialOffers, useAddSpecialOffer, useDeleteSpecialOffer, useSupportTickets, useCreateSupportTicket, useCountLocations, useAddCountLocation, useDeleteCountLocation } from "@/hooks/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { generateReferralCode, MEASURE_PRESETS } from "@/lib/calculations";
import { Plus, Trash2, Copy, ExternalLink, Mail, Gift, CheckCircle2, Lightbulb } from "lucide-react";
import { Link } from "wouter";
import { useStripePrices, useStripeSubscription, useStartCheckout, useOpenPortal } from "@/hooks/useSubscription";
import { AFFILIATE_LINKS } from "@/lib/affiliates";
import { useReferral, useReferralProgress, useCheckReferralQualification } from "@/hooks/useReferrals";
import { StocktakeScheduleSettings } from "@/components/StocktakeScheduleSettings";

const SUPPORT_EMAIL = "hello@stocktap.net";

export default function Settings() {
  const { venue, profile, user, signOut, refreshVenue } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: locations } = useLocations(venue?.id);
  const initialTab = new URLSearchParams(window.location.search).get("tab") ?? "locations";

  // Locations state (library grouping)
  const [newLocationName, setNewLocationName] = useState("");
  const [addingLocation, setAddingLocation] = useState(false);

  // Count locations state (stocktake counting locations)
  const { data: countLocations } = useCountLocations(venue?.id);
  const addCountLocation = useAddCountLocation();
  const deleteCountLocation = useDeleteCountLocation();
  const [newCountLocationName, setNewCountLocationName] = useState("");
  const [editingCountLocationId, setEditingCountLocationId] = useState<string | null>(null);
  const [editingCountLocationName, setEditingCountLocationName] = useState("");

  // Defaults state
  const [venueName, setVenueName] = useState(venue?.name ?? "");
  const [measureMl, setMeasureMl] = useState(String(venue?.measure_ml ?? 25));
  const [measureSystem, setMeasureSystem] = useState((venue as any)?.measure_system ?? "uk");
  const [defaultView, setDefaultView] = useState(profile?.default_view ?? "tenths");
  const [orderCycleDays, setOrderCycleDays] = useState(String(venue?.order_cycle_days ?? 21));
  const [savingDefaults, setSavingDefaults] = useState(false);

  // Team state
  const { data: members } = useQuery({
    queryKey: ["venue-members", venue?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("venue_members")
        .select("*, profiles(full_name)")
        .eq("venue_id", venue!.id);
      if (error) throw error;
      return data;
    },
    enabled: !!venue?.id,
  });

  // Support
  const { data: supportTickets } = useSupportTickets(venue?.id);
  const createTicket = useCreateSupportTicket();
  const [supportSubject, setSupportSubject] = useState("");
  const [supportMessage, setSupportMessage] = useState("");
  const [lastAutoReply, setLastAutoReply] = useState<string | null>(null);

  // Special offers
  const { data: products } = useProducts(venue?.id);
  const { data: offers } = useSpecialOffers(venue?.id);
  const addOffer = useAddSpecialOffer();
  const deleteOffer = useDeleteSpecialOffer();
  const [offerName, setOfferName] = useState("");
  const [offerPrice, setOfferPrice] = useState("");
  const [offerStarts, setOfferStarts] = useState(() => new Date().toISOString().slice(0, 10));
  const [offerEnds, setOfferEnds] = useState("");
  const [offerProductIds, setOfferProductIds] = useState<string[]>([]);

  // Referral
  const { data: referral, refetch: refetchReferral } = useReferral(venue?.id);
  const { data: referralProgress } = useReferralProgress(referral?.referred_venue_id ? referral.id : undefined);
  const checkQualification = useCheckReferralQualification();

  React.useEffect(() => {
    if (referral && referral.status === "pending" && referral.referred_venue_id) {
      checkQualification.mutate(referral.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [referral?.id, referral?.referred_venue_id]);

  const generateReferral = async () => {
    if (!venue?.id) return;
    const code = generateReferralCode(venue.id);
    await supabase.from("referrals").insert({
      venue_id: venue.id,
      code,
      status: "pending",
    });
    refetchReferral();
    toast({ title: "Referral code created", description: code });
  };

  const addLocation = async () => {
    if (!venue?.id || !newLocationName.trim()) return;
    if (venue.tier === "free" && (locations?.length ?? 0) >= 1) {
      toast({ title: "Free plan — 1 location limit", description: "Upgrade to Pro to add multiple locations.", variant: "destructive" });
      return;
    }
    setAddingLocation(true);
    try {
      const sort = (locations?.length ?? 0);
      await supabase.from("locations").insert({
        venue_id: venue.id,
        name: newLocationName.trim(),
        sort,
      });
      queryClient.invalidateQueries({ queryKey: ["locations", venue.id] });
      setNewLocationName("");
      toast({ title: "Location added" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setAddingLocation(false);
    }
  };

  const addCountLocationHandler = async () => {
    if (!venue?.id || !newCountLocationName.trim()) return;
    try {
      await addCountLocation.mutateAsync({
        venue_id: venue.id,
        name: newCountLocationName.trim(),
        sort: countLocations?.length ?? 0,
      });
      setNewCountLocationName("");
      toast({ title: "Counting location added" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const deleteCountLocationHandler = async (id: string) => {
    if (!venue?.id) return;
    try {
      await deleteCountLocation.mutateAsync({ id, venue_id: venue.id });
      toast({ title: "Location removed" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const addOfferHandler = async () => {
    // Only the deal text is required — price, dates and products are optional so a
    // multi-buy mechanic ("3 for £12", "Double up for £2") can be jotted down as-is.
    if (!venue?.id || !offerName.trim()) {
      toast({ title: "Add the deal", description: "Type the deal, e.g. “3 for £12” or “Double up for £2”.", variant: "destructive" });
      return;
    }
    try {
      await addOffer.mutateAsync({
        venue_id: venue.id,
        name: offerName.trim(),
        offer_price: offerPrice ? parseFloat(offerPrice) : null,
        starts_at: offerStarts ? new Date(offerStarts).toISOString() : null,
        ends_at: offerEnds ? new Date(offerEnds).toISOString() : null,
        product_ids: offerProductIds,
      } as any);
      setOfferName("");
      setOfferPrice("");
      setOfferProductIds([]);
      toast({ title: "Deal saved" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const toggleOfferProduct = (id: string) => {
    setOfferProductIds((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));
  };

  const submitSupportTicket = async () => {
    if (!venue?.id || !supportSubject.trim() || !supportMessage.trim()) {
      toast({ title: "Add a subject and message", variant: "destructive" });
      return;
    }
    try {
      const ticket = await createTicket.mutateAsync({
        venue_id: venue.id,
        user_id: user?.id ?? null,
        subject: supportSubject.trim(),
        message: supportMessage.trim(),
      });
      setLastAutoReply(ticket.auto_reply);
      setSupportSubject("");
      setSupportMessage("");
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const deleteLocation = async (id: string) => {
    if (!venue?.id) return;
    await supabase.from("locations").delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["locations", venue.id] });
    toast({ title: "Location removed" });
  };

  const saveDefaults = async () => {
    if (!venue?.id || !user?.id) return;
    setSavingDefaults(true);
    try {
      await Promise.all([
        supabase.from("venues").update({
          name: venueName.trim(),
          measure_ml: parseFloat(measureMl),
          measure_system: measureSystem,
          order_cycle_days: parseInt(orderCycleDays),
        }).eq("id", venue.id),
        supabase.from("profiles").update({ default_view: defaultView }).eq("user_id", user.id),
      ]);
      await refreshVenue();
      queryClient.invalidateQueries({ queryKey: ["products", venue.id] });
      toast({ title: "Settings saved" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSavingDefaults(false);
    }
  };

  const removeTeamMember = async (userId: string) => {
    if (!venue?.id) return;
    await supabase.from("venue_members").delete()
      .eq("venue_id", venue.id)
      .eq("user_id", userId);
    queryClient.invalidateQueries({ queryKey: ["venue-members", venue.id] });
    toast({ title: "Team member removed" });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-border bg-card sticky top-0 z-10">
        <h1 className="text-2xl font-bold text-primary">Settings</h1>
        {venue && <p className="text-sm text-muted-foreground mt-0.5">{venue.name}</p>}
      </div>

      <Tabs defaultValue={initialTab} className="flex-1 flex flex-col overflow-hidden">
        <div className="overflow-x-auto">
          <TabsList className="mx-4 mt-4 flex w-max gap-1">
            <TabsTrigger value="locations">Locations</TabsTrigger>
            <TabsTrigger value="counting">Counting</TabsTrigger>
            <TabsTrigger value="defaults">Defaults</TabsTrigger>
            <TabsTrigger value="offers">Offers</TabsTrigger>
            <TabsTrigger value="team">Team</TabsTrigger>
            <TabsTrigger value="referral">Referral</TabsTrigger>
            <TabsTrigger value="subscription">Plan</TabsTrigger>
          </TabsList>
        </div>

        {/* LOCATIONS TAB */}
        <TabsContent value="locations" className="flex-1 overflow-auto p-4 space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="New location name"
              value={newLocationName}
              onChange={e => setNewLocationName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addLocation()}
              data-testid="input-new-location"
            />
            <Button onClick={addLocation} disabled={addingLocation || !newLocationName.trim()} data-testid="button-add-location">
              <Plus className="w-4 h-4" />
            </Button>
          </div>

          {!locations?.length ? (
            <p className="text-sm text-muted-foreground text-center py-6">No locations yet. Add a cellar, bar, garden...</p>
          ) : (
            <div className="space-y-2">
              {locations.map(loc => (
                <Card key={loc.id}>
                  <CardContent className="p-3 flex justify-between items-center">
                    <span className="font-medium">{loc.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive h-8 w-8"
                      onClick={() => deleteLocation(loc.id)}
                      data-testid={`button-delete-location-${loc.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* COUNTING TAB */}
        <TabsContent value="counting" className="flex-1 overflow-auto p-4 space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-primary mb-1">Counting locations</h2>
            <p className="text-xs text-muted-foreground mb-3">
              Add the physical locations you count during stocktakes — e.g. Bar, Cellar, Beer garden.
              These appear as options when logging a line entry.
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. Bar, Cellar, Connected bar"
                value={newCountLocationName}
                onChange={e => setNewCountLocationName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addCountLocationHandler()}
                data-testid="input-new-count-location"
              />
              <Button
                onClick={addCountLocationHandler}
                disabled={addCountLocation.isPending || !newCountLocationName.trim()}
                data-testid="button-add-count-location"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {!countLocations?.length ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No counting locations yet. Add your first one above.
            </p>
          ) : (
            <div className="space-y-2">
              {countLocations.map(loc => (
                <Card key={loc.id} data-testid={`card-count-location-${loc.id}`}>
                  <CardContent className="p-3 flex justify-between items-center">
                    <span className="font-medium text-sm">{loc.name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive h-8 w-8"
                      onClick={() => deleteCountLocationHandler(loc.id)}
                      disabled={deleteCountLocation.isPending}
                      data-testid={`button-delete-count-location-${loc.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {venue?.id && (
            <StocktakeScheduleSettings
              venueId={venue.id}
              countLocations={countLocations ?? []}
            />
          )}

        </TabsContent>

        {/* DEFAULTS TAB */}
        <TabsContent value="defaults" className="flex-1 overflow-auto p-4 space-y-4">
          <div>
            <Label htmlFor="s-venue-name">Venue Name</Label>
            <Input
              id="s-venue-name"
              value={venueName}
              onChange={e => setVenueName(e.target.value)}
              className="mt-1"
              data-testid="input-venue-name"
            />
          </div>

          <div>
            <Label>Measure System</Label>
            <Select
              value={measureSystem}
              onValueChange={(v) => {
                setMeasureSystem(v);
                const preset = MEASURE_PRESETS[v];
                if (preset?.options.length) setMeasureMl(String(preset.options[0].ml));
              }}
            >
              <SelectTrigger className="mt-1" data-testid="select-measure-system">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(MEASURE_PRESETS).map(([key, preset]) => (
                  <SelectItem key={key} value={key}>{preset.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Default Measure</Label>
            <Select value={measureMl} onValueChange={setMeasureMl}>
              <SelectTrigger className="mt-1" data-testid="select-measure">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(MEASURE_PRESETS[measureSystem]?.options ?? MEASURE_PRESETS.uk.options).map(opt => (
                  <SelectItem key={opt.label} value={String(opt.ml)}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Display Mode</Label>
            <Select value={defaultView} onValueChange={(v) => setDefaultView(v as "tenths" | "exact")}>
              <SelectTrigger className="mt-1" data-testid="select-display-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="tenths">Tenths (e.g. 7.5)</SelectItem>
                <SelectItem value="exact">Exact ml / measures</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Order Cycle</Label>
            <p className="text-xs text-muted-foreground mt-0.5 mb-1">How often your supplier delivers — used for days-of-cover alerts.</p>
            <Select value={orderCycleDays} onValueChange={setOrderCycleDays}>
              <SelectTrigger className="mt-1" data-testid="select-order-cycle">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Weekly (7 days)</SelectItem>
                <SelectItem value="14">Fortnightly (14 days)</SelectItem>
                <SelectItem value="21">3-weekly (21 days) — most common</SelectItem>
                <SelectItem value="28">Monthly (28 days)</SelectItem>
                <SelectItem value="35">5-weekly (35 days)</SelectItem>
                <SelectItem value="42">6-weekly (42 days)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button className="w-full h-12 font-bold" onClick={saveDefaults} disabled={savingDefaults} data-testid="button-save-defaults">
            {savingDefaults ? "Saving..." : "Save Changes"}
          </Button>
        </TabsContent>

        {/* OFFERS TAB */}
        <TabsContent value="offers" className="flex-1 overflow-auto p-4 space-y-4">
          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="font-bold text-primary">New deal / offer</div>
              <div>
                <Label htmlFor="offer-name">Deal</Label>
                <Input
                  id="offer-name"
                  value={offerName}
                  onChange={(e) => setOfferName(e.target.value)}
                  placeholder="e.g. 3 for £12 · Double up for £2 · Happy Hour Lager"
                  className="mt-1"
                  data-testid="input-offer-name"
                />
                <p className="text-[11px] text-muted-foreground mt-1">Write the deal however it runs — a price and dates below are optional.</p>
              </div>
              <div>
                <Label htmlFor="offer-price">Offer price (£, optional)</Label>
                <Input
                  id="offer-price"
                  type="number"
                  step="0.01"
                  value={offerPrice}
                  onChange={(e) => setOfferPrice(e.target.value)}
                  className="mt-1"
                  data-testid="input-offer-price"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="offer-starts">Starts (optional)</Label>
                  <Input
                    id="offer-starts"
                    type="date"
                    value={offerStarts}
                    onChange={(e) => setOfferStarts(e.target.value)}
                    className="mt-1"
                    data-testid="input-offer-starts"
                  />
                </div>
                <div>
                  <Label htmlFor="offer-ends">Ends (optional)</Label>
                  <Input
                    id="offer-ends"
                    type="date"
                    value={offerEnds}
                    onChange={(e) => setOfferEnds(e.target.value)}
                    className="mt-1"
                    data-testid="input-offer-ends"
                  />
                </div>
              </div>
              <div>
                <Label>Products (optional)</Label>
                <div className="mt-1 max-h-40 overflow-auto border border-border rounded-lg divide-y divide-border">
                  {products?.map((p: any) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleOfferProduct(p.id)}
                      className={`w-full flex items-center justify-between px-3 py-2 text-sm text-left ${offerProductIds.includes(p.id) ? "bg-[#E0A343]/10 text-primary font-medium" : ""}`}
                      data-testid={`button-offer-product-${p.id}`}
                    >
                      {p.name}
                      {offerProductIds.includes(p.id) && <span className="text-xs">Selected</span>}
                    </button>
                  ))}
                  {!products?.length && (
                    <div className="px-3 py-2 text-sm text-muted-foreground">Add products in the Library first.</div>
                  )}
                </div>
              </div>
              <Button
                className="w-full h-12 font-bold"
                onClick={addOfferHandler}
                disabled={addOffer.isPending}
                data-testid="button-create-offer"
              >
                {addOffer.isPending ? "Saving..." : "Save deal"}
              </Button>
            </CardContent>
          </Card>

          <div className="space-y-2">
            {offers?.map((o: any) => {
              const hasDates = o.starts_at && o.ends_at;
              const active = hasDates ? (new Date(o.starts_at) <= new Date() && new Date() <= new Date(o.ends_at)) : true;
              const meta = [
                o.offer_price != null ? `£${Number(o.offer_price).toFixed(2)} ex-VAT` : null,
                hasDates ? `${new Date(o.starts_at).toLocaleDateString()} – ${new Date(o.ends_at).toLocaleDateString()}` : null,
                (o.product_ids?.length ?? 0) > 0 ? `${o.product_ids.length} product(s)` : null,
              ].filter(Boolean).join(" · ");
              return (
                <Card key={o.id}>
                  <CardContent className="p-3 flex justify-between items-center">
                    <div>
                      <div className="font-medium text-sm flex items-center gap-2">
                        {o.name}
                        <Badge variant={active ? "default" : "secondary"} className="text-xs">
                          {!hasDates ? "Always on" : active ? "Active" : "Scheduled/Ended"}
                        </Badge>
                      </div>
                      {meta && (
                        <div className="text-xs text-muted-foreground mt-0.5">{meta}</div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive h-8 w-8"
                      onClick={() => venue?.id && deleteOffer.mutate({ id: o.id, venue_id: venue.id })}
                      data-testid={`button-delete-offer-${o.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
            {!offers?.length && (
              <p className="text-xs text-muted-foreground text-center pt-2">No special offers yet.</p>
            )}
          </div>
        </TabsContent>

        {/* TEAM TAB */}
        <TabsContent value="team" className="flex-1 overflow-auto p-4 space-y-3">
          {members?.map((m: any) => (
            <Card key={m.user_id}>
              <CardContent className="p-3 flex justify-between items-center">
                <div>
                  <div className="font-medium text-sm">{m.profiles?.full_name ?? m.user_id.slice(0, 12)}</div>
                  <Badge variant="secondary" className="text-xs capitalize mt-0.5">{m.role}</Badge>
                </div>
                {m.user_id !== user?.id && m.role !== "owner" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive h-8 w-8"
                    onClick={() => removeTeamMember(m.user_id)}
                    data-testid={`button-remove-member-${m.user_id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
          <p className="text-xs text-muted-foreground text-center pt-2">
            To add team members, ask them to sign up at this app's URL and you can then assign their role.
          </p>
        </TabsContent>

        {/* REFERRAL TAB */}
        <TabsContent value="referral" className="flex-1 overflow-auto p-4 space-y-4">
          {venue?.tier === "free" && (
            <Card className="border-[#E0A343]/30 bg-[#E0A343]/5">
              <CardContent className="p-4 flex items-start gap-3">
                <Gift className="w-5 h-5 text-[#E0A343] shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-sm">Invite a mate, earn a free month</div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Share your code with another venue. Once they've been on Pro for 30 days straight, you get a month of Pro free.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {!referral ? (
            <div className="text-center py-8 space-y-4">
              <p className="text-sm text-muted-foreground">You don't have a referral code yet.</p>
              <Button onClick={generateReferral} data-testid="button-generate-referral">Generate My Code</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="p-4 text-center">
                  <div className="text-xs text-muted-foreground mb-1">Your referral code</div>
                  <div className="text-3xl font-bold tracking-widest text-primary font-mono">{referral.code}</div>
                  <div className="flex items-center justify-center gap-2 mt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => { navigator.clipboard.writeText(referral.code); toast({ title: "Copied to clipboard" }); }}
                      data-testid="button-copy-referral"
                    >
                      <Copy className="w-3.5 h-3.5 mr-1.5" /> Copy Code
                    </Button>
                    {navigator.share && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          navigator.share({
                            title: "StockTap",
                            text: `Use my StockTap referral code ${referral.code} when you sign up.`,
                          })
                        }
                        data-testid="button-share-referral"
                      >
                        Share
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>

              {referral.referred_venue_id ? (
                <Card>
                  <CardContent className="p-4 space-y-2">
                    <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Referred venue</div>
                    {referralProgress ? (
                      <>
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{referralProgress.venue_name}</span>
                          <Badge variant="secondary" className="capitalize">{referralProgress.tier}</Badge>
                        </div>
                        {referral.status === "qualified" ? (
                          <div className="flex items-center gap-2 text-sm text-[#3FAE74] font-medium pt-1">
                            <CheckCircle2 className="w-4 h-4" /> Qualified — your free Pro month is on us. We'll be in touch to apply it.
                          </div>
                        ) : referralProgress.tier === "pro" && referralProgress.pro_since ? (
                          <p className="text-xs text-muted-foreground">
                            On Pro since {new Date(referralProgress.pro_since).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })} — needs 30 continuous days to qualify.
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground">Not on Pro yet — reward unlocks once they've been on Pro for 30 continuous days.</p>
                        )}
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">Someone's used your code — waiting on their plan details.</p>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Share this code with other pubs and bars. When they sign up with it, you'll see their progress here.
                </p>
              )}
            </div>
          )}

          <div className="pt-4 border-t border-border">
            <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Affiliate Kit</div>
            <div className="space-y-2">
              {[
                ...AFFILIATE_LINKS,
              ].map(link => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between p-3 bg-card border border-border rounded-xl text-sm font-medium hover:bg-muted/50 transition-colors"
                >
                  {link.label}
                  <ExternalLink className="w-4 h-4 text-muted-foreground" />
                </a>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* SUBSCRIPTION TAB */}
        <TabsContent value="subscription" className="flex-1 overflow-auto p-4 space-y-4">
          {(venue as any)?.founding_landlord && (
            <Card className="border-[#E0A343]/40 bg-[#E0A343]/5">
              <CardContent className="p-4 flex items-center gap-3">
                <Badge className="bg-[#E0A343] text-black font-bold shrink-0">Founding Landlord</Badge>
                <p className="text-xs text-muted-foreground">
                  You're one of our first 20 venues on StockTap — thank you for being part of "The Lock-In".
                </p>
              </CardContent>
            </Card>
          )}
          <SubscriptionTab venueId={venue?.id} stripeCustomerId={venue?.stripe_customer_id ?? null} email={user?.email ?? ""} />
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=StockTap%20billing%20question`}
            className="flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors pt-2"
            data-testid="link-plan-support"
          >
            <Mail className="w-3.5 h-3.5" /> Questions about your plan? Contact support
          </a>
        </TabsContent>
      </Tabs>

      <div className="p-4 border-t border-border space-y-3">
        <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Help &amp; Support</div>

        {lastAutoReply && (
          <Card className="border-[#3FAE74]/40 bg-[#3FAE74]/5">
            <CardContent className="p-3 text-sm text-foreground">{lastAutoReply}</CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-3 space-y-2">
            <Input
              placeholder="Subject"
              value={supportSubject}
              onChange={(e) => setSupportSubject(e.target.value)}
              data-testid="input-support-subject"
            />
            <textarea
              placeholder="Tell us what's happening — we'll auto-categorise and reply here instantly, then follow up by email if needed."
              value={supportMessage}
              onChange={(e) => setSupportMessage(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-20 resize-none"
              data-testid="textarea-support-message"
            />
            <Button
              className="w-full h-11 font-semibold"
              onClick={submitSupportTicket}
              disabled={createTicket.isPending}
              data-testid="button-submit-support"
            >
              {createTicket.isPending ? "Sending..." : "Send Message"}
            </Button>
          </CardContent>
        </Card>

        {!!supportTickets?.length && (
          <div className="space-y-1.5">
            {supportTickets.slice(0, 3).map((t: any) => (
              <div key={t.id} className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                <span className="font-medium text-foreground">{t.subject}</span> · {new Date(t.created_at).toLocaleDateString()} · <Badge variant="secondary" className="text-[10px] capitalize ml-1">{t.status}</Badge>
              </div>
            ))}
          </div>
        )}

        <Link
          href="/suggestions"
          className="flex items-center justify-between p-3 bg-card border border-border rounded-xl text-sm font-medium hover:bg-muted/50 transition-colors"
          data-testid="link-suggestions"
        >
          <span className="flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-muted-foreground" /> Suggest a feature
          </span>
          <span className="text-xs text-muted-foreground">Vote on ideas</span>
        </Link>

        <a
          href={`mailto:${SUPPORT_EMAIL}?subject=StockTap%20support`}
          className="flex items-center justify-between p-3 bg-card border border-border rounded-xl text-sm font-medium hover:bg-muted/50 transition-colors"
          data-testid="link-help-support"
        >
          <span className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-muted-foreground" /> Email us directly
          </span>
          <span className="text-xs text-muted-foreground">{SUPPORT_EMAIL}</span>
        </a>

        <div className="flex gap-2 text-xs">
          <Link href="/help" className="flex-1 text-center p-2.5 bg-card border border-border rounded-xl font-medium hover:bg-muted/50 transition-colors" data-testid="link-settings-help">
            Help &amp; FAQ
          </Link>
          <Link href="/terms" className="flex-1 text-center p-2.5 bg-card border border-border rounded-xl font-medium hover:bg-muted/50 transition-colors" data-testid="link-settings-terms">
            Terms
          </Link>
          <Link href="/privacy" className="flex-1 text-center p-2.5 bg-card border border-border rounded-xl font-medium hover:bg-muted/50 transition-colors" data-testid="link-settings-privacy">
            Privacy
          </Link>
        </div>

        <Button variant="outline" className="w-full h-12 text-destructive border-destructive/30" onClick={signOut} data-testid="button-sign-out">
          Sign Out
        </Button>
      </div>
    </div>
  );
}

const PRO_FEATURES = [
  "Unlimited stocktakes by weight",
  "Daily spot checks + till variance",
  "Product library with GP% tracking",
  "Offline-first — works in the cellar",
  "CSV export for any period",
];

const PREMIUM_EXTRA_FEATURES = [
  "AI insight engine — variance explained",
  "Demand forecasting + reorder alerts",
  "Multi-venue consolidated reports",
  "Priority support",
];

function PlanCard({
  name,
  price,
  period = "/mo ex-VAT",
  features,
  extraFeatures,
  badge,
  accentClass,
  buttonLabel,
  onStart,
  isPending,
  disabled,
  testId,
}: {
  name: string;
  price: string;
  period?: string;
  features: string[];
  extraFeatures?: string[];
  badge?: string;
  accentClass: string;
  buttonLabel: string;
  onStart: () => void;
  isPending: boolean;
  disabled: boolean;
  testId: string;
}) {
  return (
    <Card className={`border ${accentClass} flex flex-col`}>
      <CardContent className="p-5 flex flex-col gap-4 flex-1">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-base">{name}</span>
          {badge && <Badge className="bg-[#E0A343] text-black text-xs font-semibold">{badge}</Badge>}
        </div>
        <div className="font-mono tabular-nums">
          <span className="text-2xl font-bold">{price}</span>
          <span className="text-sm text-muted-foreground">{period}</span>
        </div>
        <ul className="space-y-1.5 text-sm flex-1">
          {features.map(f => (
            <li key={f} className="flex items-start gap-2">
              <span className="text-[#3FAE74] font-bold mt-0.5 shrink-0">&#10003;</span>
              {f}
            </li>
          ))}
          {extraFeatures?.map(f => (
            <li key={f} className="flex items-start gap-2">
              <span className="text-[#E0A343] font-bold mt-0.5 shrink-0">&#10003;</span>
              {f}
            </li>
          ))}
        </ul>
        <div className="text-xs text-center text-[#E0A343] bg-[#E0A343]/10 border border-[#E0A343]/20 rounded-lg px-3 py-2">
          14-day free trial — no card required upfront
        </div>
        <Button
          className="w-full h-12 font-bold bg-[#E0A343] hover:bg-[#E0A343]/90 text-black"
          onClick={onStart}
          disabled={disabled || isPending}
          data-testid={testId}
        >
          {isPending ? "Redirecting..." : buttonLabel}
        </Button>
      </CardContent>
    </Card>
  );
}

function SubscriptionTab({ venueId, stripeCustomerId, email }: { venueId: string | undefined; stripeCustomerId: string | null; email: string }) {
  const [billingInterval, setBillingInterval] = useState<"month" | "year">("month");
  const { data: prices, isLoading: pricesLoading } = useStripePrices(billingInterval);
  const { data: sub, isLoading: subLoading } = useStripeSubscription(stripeCustomerId);
  const checkout = useStartCheckout();
  const portal = useOpenPortal();

  const isLoading = pricesLoading || subLoading;

  const proPrice = prices?.pro;
  const premiumPrice = prices?.premium;

  const fmt = (amount: number, currency: string) =>
    new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase(), minimumFractionDigits: 0 }).format(amount / 100);

  const fmtDate = (ts: number) =>
    new Date(ts * 1000).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  const statusLabel = (status: string) => {
    if (status === "trialing") return "Trial";
    if (status === "active") return "Active";
    if (status === "past_due") return "Past due";
    if (status === "canceled") return "Cancelled";
    return status;
  };

  const startCheckout = (price: typeof proPrice) => {
    if (!venueId || !price) return;
    checkout.mutate({ email, venueId, priceId: price.id });
  };

  if (isLoading) {
    return <div className="text-sm text-muted-foreground py-8 text-center">Loading plan details...</div>;
  }

  // Active / trialing / past_due — show current plan status + portal
  if (sub && (sub.status === "active" || sub.status === "trialing" || sub.status === "past_due")) {
    const trialEnd = sub.trial_end ? fmtDate(sub.trial_end) : null;
    const periodEnd = sub.current_period_end ? fmtDate(sub.current_period_end) : null;

    return (
      <div className="space-y-4">
        <Card className="border-[#E0A343]/30 bg-[#E0A343]/5">
          <CardContent className="p-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Plan</span>
              <Badge className="bg-[#E0A343] text-black font-semibold">{statusLabel(sub.status)}</Badge>
            </div>
            {sub.status === "trialing" && trialEnd && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">Trial ends</span>
                <span className="text-sm font-medium">{trialEnd}</span>
              </div>
            )}
            {sub.status === "active" && periodEnd && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">Next billing</span>
                <span className="text-sm font-medium">{periodEnd}</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Button
          className="w-full h-12 font-semibold"
          variant="outline"
          onClick={() => stripeCustomerId && portal.mutate(stripeCustomerId)}
          disabled={portal.isPending || !stripeCustomerId}
          data-testid="button-manage-subscription"
        >
          {portal.isPending ? "Opening..." : "Manage Subscription"}
        </Button>
        <p className="text-xs text-center text-muted-foreground">
          Cancel, update card, or view invoices via the Stripe billing portal.
        </p>
      </div>
    );
  }

  // No active subscription — show both plan cards side by side
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-center gap-3">
        <span className={`text-sm font-medium ${billingInterval === "month" ? "text-foreground" : "text-muted-foreground"}`}>Monthly</span>
        <button
          type="button"
          role="switch"
          aria-checked={billingInterval === "year"}
          onClick={() => setBillingInterval((i) => (i === "month" ? "year" : "month"))}
          className={`relative w-11 h-6 rounded-full transition-colors ${billingInterval === "year" ? "bg-[#E0A343]" : "bg-muted"}`}
          data-testid="switch-billing-interval"
        >
          <span
            className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${billingInterval === "year" ? "translate-x-5" : ""}`}
          />
        </button>
        <span className={`text-sm font-medium ${billingInterval === "year" ? "text-foreground" : "text-muted-foreground"}`}>
          Annual <span className="text-[#3FAE74] font-semibold">— save 2 months</span>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <PlanCard
          name="Pro"
          price={proPrice ? fmt(proPrice.unit_amount, proPrice.currency) : billingInterval === "year" ? "£190" : "£19"}
          period={billingInterval === "year" ? "/yr ex-VAT" : "/mo ex-VAT"}
          features={PRO_FEATURES}
          accentClass="border-border"
          badge={undefined}
          buttonLabel="Start Pro trial"
          onStart={() => startCheckout(proPrice)}
          isPending={checkout.isPending}
          disabled={!venueId || !proPrice}
          testId="button-start-trial-pro"
        />
        <PlanCard
          name="Premium"
          price={premiumPrice ? fmt(premiumPrice.unit_amount, premiumPrice.currency) : billingInterval === "year" ? "£390" : "£39"}
          period={billingInterval === "year" ? "/yr ex-VAT" : "/mo ex-VAT"}
          features={PRO_FEATURES}
          extraFeatures={PREMIUM_EXTRA_FEATURES}
          accentClass="border-[#E0A343]/40 bg-[#E0A343]/5"
          badge="Best value"
          buttonLabel="Start Premium trial"
          onStart={() => startCheckout(premiumPrice)}
          isPending={checkout.isPending}
          disabled={!venueId || !premiumPrice}
          testId="button-start-trial-premium"
        />
      </div>
      {billingInterval === "year" && !pricesLoading && !proPrice && !premiumPrice && (
        <p className="text-xs text-center text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Annual billing isn't available yet — the buttons stay disabled until annual prices are added in Stripe. Switch back to Monthly to subscribe today.
        </p>
      )}
      <p className="text-xs text-center text-muted-foreground">
        Securely handled by Stripe. Cancel any time.
      </p>
    </div>
  );
}
