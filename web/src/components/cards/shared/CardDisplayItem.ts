/**
 * Shared display-item shape for status cards that flatten a heterogeneous
 * raw payload (multiple resource families) into a single row type for
 * rendering by `ItemRow`.
 *
 * The `Category` type parameter is the card's category-vocabulary union
 * (e.g. `'pipeline' | 'experiment' | 'notebook' | 'training'`), so a card
 * that types its rows as `CardDisplayItem<'pipeline' | ...>` still gets
 * type-narrowing on `item.category` in switch statements.
 *
 * All other fields are common across the cards that flatten this way and
 * are always `string`, matching the existing `KubeflowDisplayItem` and
 * `OpenKruiseDisplayItem` shapes exactly. Because these two types were
 * defined byte-for-byte identically (differing only in the `category`
 * union), aliasing them onto this shared shape is behaviorally a no-op:
 * `KubeflowDisplayItem` is now `CardDisplayItem<'pipeline' | ...>`, and
 * likewise for OpenKruise.
 *
 * See kubestellar/console-marketplace#842 for the wider ItemRow / shared
 * primitive extraction this type unblocks.
 */
export interface CardDisplayItem<Category extends string = string> {
  id: string
  name: string
  namespace: string
  cluster: string
  category: Category
  status: string
  primaryDetail: string
  secondaryDetail: string
  timestamp: string
}
