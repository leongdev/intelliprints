import type { PlanCard } from "./logistics";

export function plannedCardFields(
  workspaceId: string,
  milestoneId: string,
  productId: string,
  card: PlanCard,
) {
  return {
    workspace: workspaceId,
    milestone: milestoneId,
    product: productId,
    component: card.componentId,
    ...(card.filamentId ? { filament: card.filamentId } : {}),
    name: card.name,
    kind: card.kind,
    column: "queue",
    quantity: card.quantity,
    gramsEach: card.gramsEach,
    minutesEach: card.minutesEach,
    priority: card.priority,
    sequence: card.sequence,
    blocked: card.blocked,
    blockedReason: card.blockedReason,
    strategyNote: card.strategyNote,
    ...(card.colors.length > 1 ? { colors: card.colors } : {}),
  };
}
