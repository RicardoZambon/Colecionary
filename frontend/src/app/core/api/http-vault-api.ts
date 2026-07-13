import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError } from 'rxjs';

import { environment } from '../../../environments/environment';
import { Collection, Item, Member, StoreListing, UserProfile } from '../models';
import { VaultApi } from './vault-api';

/**
 * Real backend implementation of {@link VaultApi} against the Vault .NET API.
 * ProblemDetails responses are unwrapped into plain Errors so existing toast
 * paths (e.g. "Already in your vault") keep working unchanged.
 */
@Injectable({ providedIn: 'root' })
export class HttpVaultApi extends VaultApi {
  private readonly http = inject(HttpClient);
  private readonly base = environment.apiBaseUrl;

  listCollections(): Observable<Collection[]> {
    return this.request(this.http.get<Collection[]>(`${this.base}/collections`));
  }

  createCollection(input: { name: string; description: string }): Observable<Collection> {
    return this.request(this.http.post<Collection>(`${this.base}/collections`, input));
  }

  updateCollection(collection: Collection): Observable<Collection> {
    return this.request(
      this.http.put<Collection>(`${this.base}/collections/${encode(collection.id)}`, collection),
    );
  }

  deleteCollection(id: string): Observable<void> {
    return this.request(this.http.delete<void>(`${this.base}/collections/${encode(id)}`));
  }

  importStoreListing(listingId: string): Observable<Collection> {
    return this.request(
      this.http.post<Collection>(`${this.base}/collections/import/${encode(listingId)}`, null),
    );
  }

  upsertItem(collectionId: string, item: Item): Observable<Item> {
    return this.request(
      this.http.put<Item>(
        `${this.base}/collections/${encode(collectionId)}/items/${encode(item.id)}`,
        item,
      ),
    );
  }

  deleteItem(collectionId: string, itemId: string): Observable<void> {
    return this.request(
      this.http.delete<void>(
        `${this.base}/collections/${encode(collectionId)}/items/${encode(itemId)}`,
      ),
    );
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

  getProfile(): Observable<UserProfile> {
    return this.request(this.http.get<UserProfile>(`${this.base}/profile`));
  }

  updateProfile(profile: UserProfile): Observable<UserProfile> {
    return this.request(this.http.put<UserProfile>(`${this.base}/profile`, profile));
  }

  private request<T>(source: Observable<T>): Observable<T> {
    return source.pipe(
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse) {
          const problem = error.error as { detail?: string; title?: string } | null;
          const message = problem?.detail || problem?.title || 'Something went wrong';
          return throwError(() => new Error(message));
        }
        return throwError(() => error);
      }),
    );
  }
}

function encode(segment: string): string {
  return encodeURIComponent(segment);
}
