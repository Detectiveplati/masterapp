# Rollback Guide — Web Push Notifications

**Commit:** `2d0e956`  
**Message:** `feat: web push notification module with test UI, VAPID, service worker`  
**Date:** 2026-02-24

---

## What was added

### New files (safe to delete entirely)

| File | Purpose |
|---|---|
| `models/PushSubscription.js` | Mongoose model storing device push subscriptions |
| `routes/push.js` | API routes: subscribe, unsubscribe, test send, list subscriptions |
| `public/sw.js` | Service worker — receives push events, shows OS notifications |
| `push-test/index.html` | Admin-only test UI at `/push-test/` |

### Modified files

#### `server.js`
Three changes:

1. **`/sw.js` route** (after the `/js` static middleware):
   ```js
   // Service worker — must be served from root with correct scope headers
   app.get('/sw.js', (req, res) => {
     res.setHeader('Service-Worker-Allowed', '/');
     res.setHeader('Content-Type', 'application/javascript');
     res.sendFile(path.join(__dirname, 'public', 'sw.js'));
   });
   ```

2. **`/push-test` page route** (before the hub `/` route):
   ```js
   // Push notification test module — admin only
   app.use('/push-test', requirePageAccess('__admin__'), express.static(path.join(__dirname, 'push-test'), noCacheHtml));
   app.get('/push-test',  requirePageAccess('__admin__'), (req, res) => res.sendFile(path.join(__dirname, 'push-test', 'index.html')));
   app.get('/push-test/', requirePageAccess('__admin__'), (req, res) => res.sendFile(path.join(__dirname, 'push-test', 'index.html')));
   ```

3. **Push API route** (after `/api/notifications`):
   ```js
   // Push notifications
   const pushRoutes = require('./routes/push');
   app.use('/api/push', pushRoutes);
   ```

#### `public/js/shell.js`
Two changes:

1. Added `'push-test'` to `MODULE_INFO`:
   ```js
   'push-test': { label: '🔔 Push Test' },
   ```

2. Added Push Test entry to `NAV` array (after Admin entry):
   ```js
   {
     icon: '🔔', label: 'Push Test', module: 'push-test',
     href: '/push-test/', perm: '__admin__',
     children: [],
   },
   ```

#### `package.json`
Added dependency:
```json
"web-push": "^3.x.x"
```

#### `.env` (local only — not committed)
Added three variables:
```
VAPID_EMAIL=admin@central-kitchen.app
VAPID_PUBLIC_KEY=BO1wEK-Fo9yPaEwyUePHDUzHc0IPm-WLFc3LExtMpS7wBzXRpgemBwA3mtMmtfhwFs5xWWPaoTie-RK_qO5mI_s
VAPID_PRIVATE_KEY=NLdJ_GNifGvT9RWSMwQs1YUh7tt3yqCPRRk4EYlKs7o
```

#### Railway Variables (if added)
Remove these three variables from Railway Dashboard → Service → Variables:
- `VAPID_EMAIL`
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`

---

## How to roll back

### Option A — Git revert (recommended, keeps history)
```bash
git revert 2d0e956 --no-edit
git push
```
This creates a new commit that undoes all changes cleanly.

### Option B — Hard reset to previous commit
```bash
git reset --hard f11317a   # commit before the push feature
git push --force
```
⚠️ This rewrites history — only use if no one else has pulled.

### Option C — Manual removal (if you want to keep other changes in that commit)
1. Delete: `models/PushSubscription.js`, `routes/push.js`, `public/sw.js`, `push-test/` folder
2. Undo the three `server.js` blocks listed above
3. Remove `'push-test'` from `MODULE_INFO` and `NAV` in `public/js/shell.js`
4. Run `npm uninstall web-push`
5. Remove VAPID keys from `.env` and Railway Variables
6. Commit and push

---

## Database cleanup (optional)
The `PushSubscription` collection in MongoDB will persist even after rollback. To clean it:
```js
// Run in MongoDB shell or Compass
db.pushsubscriptions.drop()
```
Or via the Railway MongoDB Atlas cluster.
