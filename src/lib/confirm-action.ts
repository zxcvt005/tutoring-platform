export type ConfirmActionState = {
  open: boolean;
  busy: boolean;
};

export function canRunConfirmedAction(state: ConfirmActionState): boolean {
  return state.open && !state.busy;
}
