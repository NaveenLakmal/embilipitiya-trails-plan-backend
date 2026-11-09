# Customer favourites

All endpoints require `Authorization: Bearer <customer access_token>`. Admin,
password-reset, expired, and revoked tokens cannot access favourites. Ownership
comes from the authenticated customer; clients do not supply a user ID.

| Request | Response | Behaviour |
| --- | --- | --- |
| `GET /favourites` | `200`, array of place objects | Current customer's saved places, newest save first; `[]` when empty. |
| `POST /favourites/:placeId` | `200`, saved place object | Saves an existing place. Repeated/concurrent saves are idempotent. |
| `DELETE /favourites/:placeId` | `204`, no response body | Removes only the customer's saved place. Repeated deletes succeed. |

Place IDs must be positive PostgreSQL 32-bit integers. Invalid IDs return `400`;
saving a nonexistent place returns `404`. Missing/invalid customer credentials
return `401`. Deleting a nonexistent or already removed favourite returns `204`.

`GET /auth/me` continues to return saved IDs in `favourite_places`. The frontend
loads the profile and full favourite places after login and on reload, and clears
them on logout. The visit plan stays in browser storage. Old browser-only
favourites are not used as account data. Hearts update only after a successful
save/remove response; errors leave the previous state intact.

The `IDX_favourites_user_place` unique index on `(user_id, place_id)` prevents
duplicates. The current application configuration (`synchronize: true`) creates
it on backend startup. If using migrations with synchronization disabled, add the
equivalent index before enabling the endpoints:

```sql
CREATE UNIQUE INDEX "IDX_favourites_user_place"
ON "favourites" ("user_id", "place_id");
```

Existing foreign keys cascade favourites when a customer or place is deleted.
Swagger documentation is available at `/api/docs` under **Favourites**.

Validation: `npm test`, `npm run build`, and `npm run lint`. HTTP tests bind a
temporary loopback port and use repository doubles, without touching the
configured application database.
