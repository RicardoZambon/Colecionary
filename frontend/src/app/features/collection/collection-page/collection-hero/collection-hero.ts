import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ImagesApi } from '../../../../core/api/images-api';
import { Collection, Member } from '../../../../core/models';
import { ImageFocusService } from '../../../../core/state/image-focus.service';
import { ToastService } from '../../../../core/state/toast.service';
import { VaultStore } from '../../../../core/state/vault.store';
import { GroupStats } from '../../../../core/utils/group-stats.util';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';
import { UiAvatarStack, UiButton, UiImageSlot, UiProgress } from '../../../../shared/ui';

/**
 * Banner, identity and the headline numbers for whatever is open — the whole
 * collection, or the group the user has drilled into. Owning the image slots
 * here keeps upload and reframing next to the surfaces they change.
 */
@Component({
  selector: 'app-collection-hero',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MoneyPipe, UiAvatarStack, UiButton, UiImageSlot, UiProgress],
  templateUrl: './collection-hero.html',
  styleUrl: './collection-hero.scss',
})
export class CollectionHero {
  protected readonly images = inject(ImagesApi);
  protected readonly focus = inject(ImageFocusService);
  private readonly store = inject(VaultStore);
  private readonly toast = inject(ToastService);

  readonly collection = input.required<Collection>();
  /** Stats for the open scope — the group when one is selected, else the lot. */
  readonly scope = input.required<GroupStats>();
  /** The whole collection, shown alongside when a group narrows the scope. */
  readonly total = input.required<GroupStats>();
  /** Name of the open group, or empty at the collection root. */
  readonly scopeName = input('');
  readonly members = input.required<Member[]>();

  protected readonly heading = computed(() => this.scopeName() || this.collection().name);

  /** True while a group narrows what the numbers describe. */
  protected readonly narrowed = computed(() => !!this.scopeName());

  /** "12 / 120" against a target, "12 / 34" against what is catalogued. */
  protected readonly ratio = computed(() => {
    const scope = this.scope();
    return `${scope.owned} / ${scope.denominator}`;
  });

  /**
   * Spells out what the bar means for a screen reader, and — printed beside it
   * — carries the same distinction the two bands make by colour alone.
   */
  protected readonly progressText = computed(() => {
    const scope = this.scope();
    if (!scope.hasTarget) return `${scope.owned} owned of ${scope.catalogued} catalogued`;
    return `${scope.owned} owned, ${scope.catalogued} catalogued, of ${scope.target} in the set`;
  });

  protected async setImage(slot: 'banner' | 'icon', file: File): Promise<void> {
    const collection = this.collection();
    try {
      const imageId = await this.focus.uploadAndFrame(file, slot);
      // Discarded in the editor: the picture that was there stays there.
      if (!imageId) return;

      await this.store.updateCollection({
        ...collection,
        bannerImageId: slot === 'banner' ? imageId : collection.bannerImageId,
        iconImageId: slot === 'icon' ? imageId : collection.iconImageId,
      });
      this.toast.flash('Image updated ✓');
    } catch (err) {
      this.toast.flash(err instanceof Error ? err.message : 'Upload failed');
    }
  }

  /** Reopens the editor for an image that is already in place. */
  protected reframe(slot: 'banner' | 'icon'): void {
    const collection = this.collection();
    const imageId = slot === 'banner' ? collection.bannerImageId : collection.iconImageId;
    if (imageId) void this.focus.frame(imageId, slot);
  }
}
