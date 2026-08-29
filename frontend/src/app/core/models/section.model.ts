/**
 * A labelled run of items inside one group — a separator, not a level.
 *
 * Groups nest and navigate: each one is a destination in the tree, turns its
 * parent's view into a dashboard of cards, can declare fields and an ordering,
 * and lists alphabetically because nothing persists a position for it. Splitting
 * "Espanha" into "Cavaleiros de Bronze / Prata / Ouro" with sub-groups therefore
 * buys three destinations nobody wanted to navigate to and loses the one thing
 * that mattered — seeing them side by side, in that order, in a single list.
 *
 * So a section deliberately carries no `parentId` (the recursion already exists
 * on `GroupNode`), no `fields` (they are taxonomy: a divider that changes the
 * item form's field set is the defect this fixes) and no `sort` (it is a run
 * inside *one* ordered list; per-run ordering would make the group's declared
 * order meaningless). What it has and a group does not is a persisted position:
 * Bronze → Prata → Ouro is a progression, and alphabetically that reads Bronze,
 * Ouro, Prata. Order is the array order of `collection.sections`, exactly like
 * items — never sort them by name.
 */
export interface Section {
  id: string;
  /** The group whose items this divides. Never blank; may dangle. */
  groupId: string;
  name: string;
  /**
   * Declared size of this run, so progress reads "Bronze 8/10" and rolls up
   * into the group. Null means undeclared and must survive round-trips, for
   * the same reason as `GroupNode.target` — and required-and-nullable rather
   * than optional, because the collection saves as a full-document PUT.
   */
  target: number | null;
}
