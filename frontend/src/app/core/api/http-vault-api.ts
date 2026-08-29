import { HttpClient, HttpErrorResponse, HttpHeaders, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import { I18nService } from '../i18n';
import { Collection, Item, Member, StoreListing, TenantSettings, UserProfile } from '../models';
import { httpErrorMessage } from './error.interceptor';
import { VaultApi, VaultConflictError, VersionedCollection, VersionedItem } from './vault-api';

/**
 * Real backend implementation of {@link VaultApi} against the Vault .NET API.
 * ProblemDetails responses are unwrapped into plain Errors so existing toast
 * paths (e.g. "Already in your vault") keep working unchanged.
 *
 * Writes to a collection carry an `If-Match` precondition and read the new
 * version back off the `ETag` response header. The server **requires** the
 * header — a request without one is refused with 428 — which is why the version
 * is a parameter on the contract rather than something this class remembers on
 * the side: a client that forgot to pass one would otherwise fail at runtime
 * instead of failing to compile.
 */
@Injectable({ providedIn: 'root' })
export class HttpVaultApi extends VaultApi {
  private readonly http = inject(HttpClient);
  private readonly i18n = inject(I18nService);
  private readonly base = environment.apiBaseUrl;

  listCollections(): Observable<VersionedCollection[]> {
    return this.request(this.http.get<VersionedCollection[]>(`${this.base}/collections`));
  }

  createCollection(input: { name: string; description: string }): Observable<VersionedCollection> {
    return this.versioned(
      this.http.post<Collection>(`${this.base}/collections`, input, { observe: 'response' }),
    );
  }

  updateCollection(collection: Collection, version: string): Observable<VersionedCollection> {
    return this.versioned(
      this.http.put<Collection>(
        `${this.base}/collections/${encode(collection.id)}`,
        collection,
        { observe: 'response', headers: ifMatch(version) },
      ),
      collection.id,
    );
  }

  deleteCollection(id: string): Observable<void> {
    return this.request(this.http.delete<void>(`${this.base}/collections/${encode(id)}`));
  }

  importStoreListing(listingId: string): Observable<VersionedCollection> {
    return this.versioned(
      this.http.post<Collection>(
        `${this.base}/collections/import/${encode(listingId)}`,
        null,
        { observe: 'response' },
      ),
    );
  }

  upsertItem(collectionId: string, item: Item, version: string): Observable<VersionedItem> {
    return this.request(
      this.http.put<Item>(
        `${this.base}/collections/${encode(collectionId)}/items/${encode(item.id)}`,
        item,
        { observe: 'response', headers: ifMatch(version) },
      ),
      collectionId,
    ).pipe(map(response => ({ version: etagOf(response), item: response.body! })));
  }

  deleteItem(collectionId: string, itemId: string): Observable<string> {
    return this.request(
      this.http.delete<void>(
        `${this.base}/collections/${encode(collectionId)}/items/${encode(itemId)}`,
        { observe: 'response' },
      ),
      collectionId,
    ).pipe(map(etagOf));
  }

  listStoreListings(): Observable<StoreListing[]> {
    return this.request(this.http.get<StoreListing[]>(`${this.base}/store/listings`));
  }

  listTenantMembers(): Observable<Member[]> {
    return this.request(this.http.get<Member[]>(`${this.base}/tenant/members`));
  }

  updateTenantMembers(members: Member[]): Observable<Member[]> {
    return this.request(this.http.put<Member[]>(`${this.base}/tenant/members`, members));
  }

  getTenantSettings(): Observable<TenantSettings> {
    return this.request(this.http.get<TenantSettings>(`${this.base}/tenant/settings`));
  }

  updateTenantSettings(settings: TenantSettings): Observable<TenantSettings> {
    return this.request(this.http.put<TenantSettings>(`${this.base}/tenant/settings`, settings));
  }

  getProfile(): Observable<UserProfile> {
    return this.request(this.http.get<UserProfile>(`${this.base}/profile`));
  }

  updateProfile(profile: UserProfile): Observable<UserProfile> {
    return this.request(this.http.put<UserProfile>(`${this.base}/profile`, profile));
  }

  /** A single-collection response, paired with the version off its ETag. */
  private versioned(
    source: Observable<HttpResponse<Collection>>,
    conflictsWith?: string,
  ): Observable<VersionedCollection> {
    return this.request(source, conflictsWith).pipe(
      map(response => ({ version: etagOf(response), collection: response.body! })),
    );
  }

  private request<T>(source: Observable<T>, collectionId?: string): Observable<T> {
    return source.pipe(
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse) {
          // Localized, and worded identically to the global report — the
          // fallback used to be the hardcoded English 'Something went wrong',
          // in the one spot a user is most likely to read it.
          const message = httpErrorMessage(error, this.i18n.t);
          // 412 alone. A 428 means this client failed to send a precondition at
          // all, which is a bug here and not a race the user can do anything
          // about — telling them "somebody else edited this" would be a lie.
          return throwError(() =>
            error.status === 412 && collectionId
              ? new VaultConflictError(collectionId, message)
              : new Error(message),
          );
        }
        return throwError(() => error);
      }),
    );
  }
}

/**
 * The version off a response, or a throw.
 *
 * A missing `ETag` is not a small problem: the app would carry on holding the
 * version from *before* the write it just made, and the very next save would be
 * refused as a conflict the user never caused. In the browser the usual cause is
 * CORS — the header has to be listed in `Access-Control-Expose-Headers`, which
 * `Program.cs` does — so failing loudly here is what turns a baffling
 * intermittent conflict into a one-line diagnosis.
 */
function etagOf(response: HttpResponse<unknown>): string {
  const etag = response.headers.get('ETag');
  if (!etag) {
    throw new Error('The server did not return an ETag; the collection version is unknown.');
  }
  return etag;
}

function ifMatch(version: string): HttpHeaders {
  return new HttpHeaders({ 'If-Match': version });
}

function encode(segment: string): string {
  return encodeURIComponent(segment);
}
