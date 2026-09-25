"""
Which master process is responsible for which account.

With several armed masters the supervisor runs one process per master (see
master_supervisor). Each of those processes used to treat EVERY account as its
own for background work: each journalled every account, swept every account's
positions and balances, and polled every command. So with two masters every
account was read twice, its terminal was attached from two processes -- the one
thing MT5 does not tolerate -- and a Close clicked in the app could be executed
by whichever process polled first, or twice.

The rule here gives every account exactly one owner:

  * an active master owns itself;
  * a follower is owned by the first active master (by id) that copies to it;
  * everything else -- inactive masters, accounts in no armed link, accounts
    journalled standalone -- belongs to the PRIMARY process, the active master
    with the lowest id.

Every process computes the same answer from the same runtime config, so no
coordination is needed. In single-master mode the one master is primary and
owns everything, which is exactly the old behaviour.

Copy dispatch is not affected: a process still sends copies to all of its own
master's followers, owned or not. Ownership decides who does the reading and
the housekeeping, never who copies.
"""

from __future__ import annotations

from typing import Iterable, Optional

from engine.config_loader import (
    AccountConfig,
    CopierConfig,
    dedupe_copiers_by_follower,
    get_copiers_for_master,
)


def active_master_ids(
    accounts: Iterable[AccountConfig], copiers: list[CopierConfig]
) -> list[str]:
    """Enabled masters with at least one enabled copy link, sorted by id."""
    return sorted(
        a.id
        for a in accounts
        if a.role == "master"
        and a.enabled
        and dedupe_copiers_by_follower(get_copiers_for_master(copiers, a.id))
    )


def owners(
    accounts: Iterable[AccountConfig], copiers: list[CopierConfig]
) -> tuple[dict[str, str], Optional[str]]:
    """({account_id: owning master id}, primary master id or None)."""
    accounts = list(accounts)
    active = active_master_ids(accounts, copiers)
    if not active:
        return {}, None
    primary = active[0]

    owner: dict[str, str] = {m: m for m in active}
    for master_id in active:
        for copier in dedupe_copiers_by_follower(get_copiers_for_master(copiers, master_id)):
            owner.setdefault(copier.follower_id, master_id)
    for account in accounts:
        owner.setdefault(account.id, primary)
    return owner, primary


def owned_account_ids(
    accounts: Iterable[AccountConfig], copiers: list[CopierConfig], master_id: str
) -> set[str]:
    """The accounts the process running ``master_id`` is responsible for."""
    owner, _primary = owners(accounts, copiers)
    return {account_id for account_id, m in owner.items() if m == master_id}


def is_primary(
    accounts: Iterable[AccountConfig], copiers: list[CopierConfig], master_id: str
) -> bool:
    """Whether ``master_id``'s process handles work for accounts nobody owns --
    such as a connection test for an account not in any config yet."""
    _owner, primary = owners(accounts, copiers)
    return primary is None or primary == master_id
