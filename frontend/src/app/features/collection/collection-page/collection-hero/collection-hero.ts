import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ImagesApi } from '../../../../core/api/images-api';
import { I18nService } from '../../../../core/i18n';
import { Collection, Member } from '../../../../core/models';
import { ImageFocusService } from '../../../../core/state/image-focus.service';
import { isReportedWriteFailure } from '../../../../core/api/vault-api';
import { ToastService } from '../../../../core/state/toast.service';
import { currencyOf } from '../../../../core/utils/currency.util';
import { VaultStore } from '../../../../core/state/vault.store';
import { GroupStats } from '../../../../core/utils/group-stats.util';
import { ItemValuePipe } from '../../../../shared/pipes/item-value.pipe';
import { TPipe } from '../../../../shared/pipes/t.pipe';
import {
  UiAvatarStack,
  UiButton,
  UiEmpty,
  UiIcon,
  UiImageSlot,
  UiProgress,
} from '../../../../shared/ui';

/**
 * Banner, identity and the headline numbers for whatever is open — the whole
 * collection, or the group the user has drilled into. Owning the image slots
 * here keeps upload and reframing next to the surfaces they change.
 */
@Component({
  selector: 'app-collection-hero',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ItemValuePipe,
    TPipe,
    UiAvatarStack,
    UiButton,
    UiEmpty,
    UiIcon,
    UiImageSlot,
    UiProgress,
  ],
  templateUrl: './collection-hero.html',
  styleUrl: './collection-hero.scss',
})
export class CollectionHero {
  /**
   * Whether to offer the write affordances at all.
   *
   * An **input**, not a read of `VaultStore.canEdit`, even though that is where
   * the answer comes from. Injecting the store into a presentational child drags
   * `VaultApi` into the TestBed of every component that renders it — the same
   * reason `CurrencyService` exists as a dependency-free signal rather than
   * letting the money pipe reach for the store. The page reads it once and
   * passes it down.
   *
   * Defaults to true so an un-passed caller keeps the behaviour it had, and so
   * this fails open exactly as the store's own computed does.
   */
  readonly canEdit = input(true);

  protected readonly images = inject(ImagesApi);
  protected readonly focus = inject(ImageFocusService);
  private readonly i18n = inject(I18nService);
  protected readonly store = inject(VaultStore);
  private readonly toast = inject(ToastService);


  readonly collection = input.required<Collection>();
  /** Stats for the open scope — the group when one is selected, else the lot. */
  readonly scope = input.required<GroupStats>();
  /** The whole collection, shown alongside when a group narrows the scope. */
  readonly total = input.required<GroupStats>();
  /** Name of the open group, or empty at the collection root. */
  readonly scopeName = input('');
  readonly members = input.required<Member[]>();
  /**
   * Nothing catalogued *and* no declared set — the one case where the whole
   * numeric apparatus is meaningless rather than merely low.
   *
   * With a target, "0 / 30 · 0%" is a real measurement of a real set and the
   * bar earns its place. Without one the denominator is the catalogued count,
   * so the bar is 0 ÷ 0, "est." is a claim that the collection is worth zero
   * (it is worth *unknown*, which is what `—` says), and "0 missing" is true
   * only in the sense that nothing was ever asked for. Rendering all of it
   * anyway is how a brand-new collection came to look like a broken one.
   *
   * An input, not a computed: `app-collection-toolbar` collapses on the same
   * fact, so the page owns it and both read the one value.
   */
  readonly blank = input.required<boolean>();

  /**
   * Amounts here belong to this collection, so they follow its currency rather
   * than the account default — a collection may override it.
   */
  protected readonly currency = computed(() => currencyOf(this.collection(), this.store.defaultCurrency()));

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
    // `catalogued` is the count that decides the agreement — pt-BR writes
    // "1 catalogado" against "2 catalogados". The other two figures agree with
    // nothing and ride along as plain params.
    return scope.hasTarget
      ? this.i18n.plural(
          scope.catalogued,
          'progress.textTarget.one',
          'progress.textTarget.other',
          { owned: scope.owned, target: scope.target! },
        )
      : this.i18n.plural(
          scope.catalogued,
          'progress.textNoTarget.one',
          'progress.textNoTarget.other',
          { owned: scope.owned },
        );
  });

  /** pt-BR conjugates this one: "falta 1", "faltam 2". */
  protected readonly missingLabel = computed(() =>
    this.i18n.plural(this.scope().missing, 'progress.missing.one', 'progress.missing.other'),
  );

  protected readonly copiesLabel = computed(() =>
    this.i18n.plural(this.scope().copies, 'progress.copies.one', 'progress.copies.other'),
  );

  /**
   * Uploads the picture, puts it in place, and only then offers to frame it.
   *
   * The order is the point. Framing used to run first, against a file that had
   * not been sent yet, so dismissing the editor — including by clicking beside
   * it — threw the upload away. Now the banner is already changed by the time
   * the editor appears, and closing it just leaves the crop centred. A banner
   * is the one image whose crop really matters, which is why the editor still
   * opens by itself here and not in the photo grid.
   */
  protected async setImage(slot: 'banner' | 'icon', file: File): Promise<void> {
    const collection = this.collection();
    try {
      const imageId = await this.images.upload(file);
      await this.store.updateCollection({
        ...collection,
        bannerImageId: slot === 'banner' ? imageId : collection.bannerImageId,
        iconImageId: slot === 'icon' ? imageId : collection.iconImageId,
      });
      this.toast.flash(this.i18n.t('toast.image.updated'));
      void this.focus.frame(imageId, slot);
    } catch (err) {
      // The bytes are uploaded either way — it is the collection that did not
      // save. The shell's notice explains a conflict and outlives a toast.
      if (isReportedWriteFailure(err)) return;
      this.toast.flash(
        err instanceof Error ? err.message : this.i18n.t('toast.photo.uploadFailed'),
      );
    }
  }

  /** Reopens the editor for an image that is already in place. */
  protected reframe(slot: 'banner' | 'icon'): void {
    const collection = this.collection();
    const imageId = slot === 'banner' ? collection.bannerImageId : collection.iconImageId;
    if (imageId) void this.focus.frame(imageId, slot);
  }
}
