# Suros — Host Outage Notification Fix

## Goal
Stop false-positive host outage/recovery spam. Deliver **one single recovery alert** that says when the system went dark and when it came back — sent only after the system is confirmed back online.

---

## Problem 1 — False Positives (Backend)

A single failed TCP check to `1.1.1.1:53` immediately flips `last_network_online = False`. On the next poll it recovers and fires a recovery alert. This happens repeatedly from transient Docker networking blips.

### Fix — `main.py`

**1. Add a dual-target reachability check.**

Replace the existing `is_internet_reachable()` function:

```python
def is_internet_reachable():
    """Returns True if either 1.1.1.1:53 or 8.8.8.8:53 is reachable."""
    import socket
    for host, port in [("1.1.1.1", 53), ("8.8.8.8", 53)]:
        try:
            socket.create_connection((host, port), timeout=2)
            return True
        except:
            continue
    return False
```

**2. Add streak globals near the existing outage globals.**

Find this block:
```python
last_network_online = True
current_outage_type = None
current_outage_start = None
```

Add two lines directly below it:
```python
host_down_streak = 0
host_up_streak = 0
HOST_CONFIRM_THRESHOLD = 3
```

**3. Replace the outage transition logic inside `monitor_sites_task()`.**

Find this block (starts after `server_online = await asyncio.to_thread(is_internet_reachable)`):

```python
# Detect network outage transitions
if server_online and not last_network_online:
    ...
if not server_online and last_network_online:
    ...
last_network_online = server_online
```

Replace the entire block with:

```python
global host_down_streak, host_up_streak

# Update streaks
if server_online:
    host_down_streak = 0
    host_up_streak += 1
else:
    host_up_streak = 0
    host_down_streak += 1

confirmed_offline = (host_down_streak == HOST_CONFIRM_THRESHOLD)
confirmed_online  = (host_up_streak  == HOST_CONFIRM_THRESHOLD and not last_network_online)

# Confirmed outage start — open the DB event, no alert sent yet
if confirmed_offline and last_network_online:
    new_outage = models.OutageEvent(
        outage_type='network',
        started_at=datetime.utcnow(),
        ended_at=None
    )
    db.add(new_outage)
    current_outage_type  = 'network'
    current_outage_start = datetime.utcnow()
    last_network_online  = False

# Confirmed recovery — close event and send THE single alert
if confirmed_online:
    if current_outage_type == 'network' and current_outage_start:
        outage_started_at  = current_outage_start
        reconnected_at     = datetime.utcnow()
        alert_title, alert_body = alert_template(
            alert_settings,
            "host_recovery_title", "host_recovery_body",
            "Host Network Restored",
            "System was offline but is back up.\nServer lost connection on: {offline_at} & re-connected at: {online_at}",
            offline_at=outage_started_at.strftime('%Y-%m-%d %H:%M:%S UTC'),
            online_at=reconnected_at.strftime('%Y-%m-%d %H:%M:%S UTC'),
        )
        open_events = db.query(models.OutageEvent).filter(
            models.OutageEvent.outage_type == 'network',
            models.OutageEvent.ended_at.is_(None)
        ).all()
        for ev in open_events:
            ev.ended_at = reconnected_at
        current_outage_type  = None
        current_outage_start = None
        asyncio.create_task(trigger_system_alert(alert_title, alert_body))
    last_network_online = True
    host_down_streak    = 0
```

> **Key behaviour:** No alert fires on outage start. Only one alert fires on confirmed recovery, containing both the offline-at and online-at timestamps.

---

## Problem 2 — Settings UI shows separate "Host Offline" template that never fires (Frontend)

The Templates tab exposes a `Host Offline` template (`host_outage_title` / `host_outage_body`). Since we intentionally never send an outage-start alert, showing this template confuses users into thinking it does something.

### Fix — `App.jsx`

**Remove the `host_outage` entry from `templateDefinitions`.**

Find:
```js
const templateDefinitions = [
  ['host_outage', 'Host Offline'],
  ['host_recovery', 'Host Recovery'],
  ['site_outage', 'Site Offline'],
  ['site_recovery', 'Site Recovery']
];
```

Change to:
```js
const templateDefinitions = [
  ['host_recovery', 'Host Recovery'],
  ['site_outage', 'Site Offline'],
  ['site_recovery', 'Site Recovery']
];
```

> The `host_recovery` template body already supports `{offline_at}` and `{online_at}` variables, so users can fully customise the single recovery message that carries both timestamps.

---

## Summary

| What | Where | Change |
|---|---|---|
| Dual-target reachability | `main.py` `is_internet_reachable()` | Require **both** `1.1.1.1` and `8.8.8.8` to fail |
| Streak debounce | `main.py` globals + `monitor_sites_task()` | 3 consecutive checks before state flip |
| Single recovery alert only | `main.py` `monitor_sites_task()` | Alert fires on recovery only, carries offline+online timestamps |
| Remove dead template | `App.jsx` `templateDefinitions` | Drop `host_outage` entry |