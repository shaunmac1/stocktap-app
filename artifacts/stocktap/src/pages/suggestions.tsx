import React, { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useFeatureSuggestions, useCreateFeatureSuggestion, useToggleSuggestionVote } from "@/hooks/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { ArrowUp, Lightbulb, Plus } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  under_review: "Under review",
  planned: "Planned",
  building: "Building",
  shipped: "Shipped",
};

const STATUS_STYLE: Record<string, string> = {
  under_review: "bg-muted text-muted-foreground",
  planned: "bg-[#E0A343]/15 text-[#E0A343] border border-[#E0A343]/30",
  building: "bg-blue-500/15 text-blue-400 border border-blue-500/30",
  shipped: "bg-[#3FAE74]/15 text-[#3FAE74] border border-[#3FAE74]/30",
};

export default function Suggestions() {
  const { user, venue } = useAuth();
  const { data: suggestions, isLoading } = useFeatureSuggestions(user?.id);
  const createSuggestion = useCreateFeatureSuggestion();
  const toggleVote = useToggleSuggestionVote();
  const { toast } = useToast();

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");

  const submit = async () => {
    if (!user?.id || !title.trim()) {
      toast({ title: "Add a title for your suggestion", variant: "destructive" });
      return;
    }
    try {
      await createSuggestion.mutateAsync({
        user_id: user.id,
        venue_id: venue?.id ?? null,
        title: title.trim(),
        detail: detail.trim(),
      });
      setTitle("");
      setDetail("");
      setShowForm(false);
      toast({ title: "Thanks — suggestion submitted" });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  const vote = (suggestionId: string, hasVoted: boolean) => {
    if (!user?.id) return;
    toggleVote.mutate({ suggestion_id: suggestionId, user_id: user.id, has_voted: hasVoted });
  };

  return (
    <div className="flex-1 flex flex-col">
      <div className="p-4 bg-card border-b border-border sticky top-0 z-10 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Suggestions</h1>
          <p className="text-xs text-muted-foreground">Tell us what to build next — upvote what matters most.</p>
        </div>
        <Button size="icon" onClick={() => setShowForm((v) => !v)} data-testid="button-toggle-suggestion-form">
          <Plus className="w-5 h-5" />
        </Button>
      </div>

      {showForm && (
        <Card className="m-4 mb-0">
          <CardContent className="p-4 space-y-2">
            <Input
              placeholder="What should we add or fix?"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              data-testid="input-suggestion-title"
            />
            <textarea
              placeholder="Any extra detail (optional)"
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-16 resize-none"
              data-testid="textarea-suggestion-detail"
            />
            <Button
              className="w-full h-11 font-semibold"
              onClick={submit}
              disabled={createSuggestion.isPending}
              data-testid="button-submit-suggestion"
            >
              {createSuggestion.isPending ? "Submitting..." : "Submit suggestion"}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="flex-1 overflow-auto p-4 space-y-3">
        {isLoading && <p className="text-sm text-muted-foreground text-center py-8">Loading suggestions…</p>}

        {!isLoading && !suggestions?.length && (
          <div className="text-center py-12 text-muted-foreground">
            <Lightbulb className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No suggestions yet — be the first.</p>
          </div>
        )}

        {suggestions?.map((s) => (
          <Card key={s.id} data-testid={`card-suggestion-${s.id}`}>
            <CardContent className="p-4 flex gap-3">
              <button
                onClick={() => vote(s.id, s.has_voted)}
                className={`flex flex-col items-center justify-center rounded-lg border w-12 h-14 shrink-0 transition-colors ${
                  s.has_voted
                    ? "bg-[#E0A343] border-[#E0A343] text-[#111316]"
                    : "border-border text-muted-foreground hover:border-[#E0A343]/50 hover:text-[#E0A343]"
                }`}
                data-testid={`button-upvote-${s.id}`}
              >
                <ArrowUp className="w-4 h-4" />
                <span className="text-sm font-bold tabular-nums">{s.upvote_count}</span>
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <h3 className="font-semibold text-sm leading-snug">{s.title}</h3>
                  {s.venue?.founding_landlord && (
                    <Badge className="bg-[#E0A343] text-[#111316] text-[10px] font-bold shrink-0" data-testid={`badge-founding-${s.id}`}>
                      Founding Landlord
                    </Badge>
                  )}
                </div>
                {s.detail && <p className="text-xs text-muted-foreground mb-2 leading-relaxed">{s.detail}</p>}
                <Badge className={`text-[10px] font-medium ${STATUS_STYLE[s.status]}`} data-testid={`badge-status-${s.id}`}>
                  {STATUS_LABEL[s.status]}
                </Badge>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
