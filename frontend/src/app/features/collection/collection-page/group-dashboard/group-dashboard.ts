import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import { ImagesApi } from '../../../../core/api/images-api';
import { I18nService } from '../../../../core/i18n';
import { GroupNode, Item } from '../../../../core/models';
import { ImageFocusService } from '../../../../core/state/image-focus.service';
import { GroupStats, UNGROUPED_ID } from '../../../../core/utils/group-stats.util';
import { childrenOf } from '../../../../core/utils/groups.util';
import { TPipe } from '../../../../shared/pipes/t.pipe';
import { MosaicTile } from '../../../../shared/ui';
import { GroupCard } from '../group-card/group-card';

interface CardView {
  id: string;
  name: string;
  stats: GroupStats;
  tiles: MosaicTile[];
}

/**
 * The sub-groups of whatever is open, as cards — the answer to "where am I
 * short?" without opening each one in turn.
 */
@Component({
  selector: 'app-group-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TPipe, GroupCard],
  templateUrl: './group-dashboard.html',
  styleUrl: './group-dashboard.scss',
})
export class GroupDashboard {
  private readonly images = inject(ImagesApi);
  private readonly focus = inject(ImageFocusService);
  private readonly i18n = inject(I18nService);

  readonly collectionId = input.required<string>();
  readonly groups = input.required<GroupNode[]>();
  readonly stats = input.required<ReadonlyMap<string, GroupStats>>();
  /** The open group, or null at the collection root. */
  readonly parentId = input<string | null>(null);
  /** Items filed directly on the open group rather than in a sub-group. */
  readonly directItems = input.required<Item[]>();

  readonly newGroup = output<void>();

  protected readonly cards = computed<CardView[]>(() => {
    const stats = this.stats();
    const cards: CardView[] = childrenOf(this.groups(), this.parentId())
      .map(node => ({ node, stats: stats.get(node.id) }))
      .filter((entry): entry is { node: GroupNode; stats: GroupStats } => !!entry.stats)
      .map(entry => ({
        id: entry.node.id,
        name: entry.node.name,
        stats: entry.stats,
        tiles: this.tilesFor(entry.stats),
      }));

    // Items whose group is blank or points at something deleted are legal and
    // otherwise invisible the moment any group is selected. Showing them keeps
    // the cards adding up to the collection total.
    const unfiled = this.parentId() === null ? stats.get(UNGROUPED_ID) : undefined;
    if (unfiled) {
      cards.push({
        id: UNGROUPED_ID,
        name: this.i18n.t('group.none'),
        stats: unfiled,
        tiles: this.tilesFor(unfiled),
      });
    }

    return cards;
  });

  /** How many items sit on the open group itself rather than below it. */
  protected readonly directCount = computed(() => this.directItems().length);

  protected readonly filedHere = computed(() =>
    this.i18n.plural(
      this.directCount(),
      'groupDashboard.filedHere.one',
      'groupDashboard.filedHere.other',
    ),
  );

  private tilesFor(stats: GroupStats): MosaicTile[] {
    return stats.coverPhotoIds.map(id => ({
      src: this.images.url(id, 'thumb') ?? '',
      position: this.focus.position(id),
    }));
  }
}
