import {
  Bell,
  Box,
  ChartColumn,
  ChevronsLeft,
  Cylinder,
  Flag,
  KanbanSquare,
  LayoutGrid,
  Menu,
  Search,
  Settings,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useDrafts } from "../context/Drafts";
import { useWorkshop } from "../context/Workshop";
import { ago } from "../lib/format";
import { filamentPressure } from "../lib/metrics";
import { colorGroups } from "../lib/pools";
import { Gate } from "../pages/Gate";
import { Logo, Modal, cn } from "./ui";

const NAV = [
  { to: "/app", label: "Dashboard", icon: LayoutGrid, end: true },
  { to: "/app/filaments", label: "Filaments", icon: Cylinder },
  { to: "/app/products", label: "Products", icon: Box },
  { to: "/app/milestones", label: "Milestones", icon: Flag },
  { to: "/app/board", label: "Prints", icon: KanbanSquare },
  { to: "/app/analytics", label: "Analytics", icon: ChartColumn },
  { to: "/app/workspace", label: "Workshop", icon: Users },
];

const TABS = [
  { to: "/app", label: "Home", icon: LayoutGrid, end: true },
  { to: "/app/filaments", label: "Spools", icon: Cylinder, end: false },
  { to: "/app/board", label: "Prints", icon: KanbanSquare, end: false },
  { to: "/app/products", label: "Products", icon: Box, end: false },
];

export function Shell() {
  const shop = useWorkshop();
  const drafts = useDrafts();
  const location = useLocation();
  const [drawer, setDrawer] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const onWorkshop = location.pathname === "/app/workspace";
  const isOwner = !!shop.workspace && shop.workspace.owner === shop.user.id;
  const showDock = drafts.dirty || (!!shop.workspace && onWorkshop);
  const seenWorkshop = useRef(shop.workspace?.id);
  useEffect(() => {
    const next = shop.workspace?.id;
    if (seenWorkshop.current && next && seenWorkshop.current !== next) drafts.clear();
    seenWorkshop.current = next;
  }, [drafts, shop.workspace?.id]);
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname]);
  const short = colorGroups(shop.filaments)
    .map((group) => ({ group, pressure: filamentPressure(group.lead, shop.cards, shop.filaments) }))
    .filter((item) => item.pressure.tone !== "ok")
    .sort((a, b) => a.group.remainingGrams - b.group.remainingGrams)[0];

  return (
    <div className="stage">
      <div className={cn("frame", collapsed && "collapsed", navOpen && "nav-open")}>
        {navOpen ? <button className="nav-back" type="button" aria-label="Close menu" onClick={() => setNavOpen(false)} /> : null}
        <aside className="side">
          <div className="brand">
            <span className="brand-mark">
              <Logo />
            </span>
            <strong>IntelliPrints</strong>
          </div>
          {shop.workspace && shop.workspaces.length > 0 ? (
            <label className="side-shop">
              <span>IntelliPrints</span>
              <select aria-label="Workshop" value={shop.workspace.id} onChange={(event) => shop.switchWorkspace(event.target.value)}>
                {shop.workspaces.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <nav className="side-nav">
            {NAV.map((item) => {
              const Icon = item.icon;
              if (!shop.workspace) {
                return (
                  <span key={item.to} className="side-link" aria-hidden="true">
                    <Icon size={18} />
                    <span>{item.label}</span>
                  </span>
                );
              }
              return (
                <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => cn("side-link", isActive && "active")} onClick={() => setNavOpen(false)}>
                  <Icon size={18} />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
          </nav>
          <div className="side-promo">
            {short ? (
              <>
                <strong>
                  {short.group.lead.color} {short.group.lead.material} is {short.pressure.tone}
                </strong>
                <p>The queue needs more of this color before those plates can start.</p>
                <Link className="btn dark" to="/app/filaments" onClick={() => setNavOpen(false)}>
                  Restock
                </Link>
              </>
            ) : (
              <>
                <strong>Spools look ready</strong>
                <p>Every roll is above its reorder line and can cover what is queued.</p>
              </>
            )}
          </div>
          <div className="side-foot">
            <button className="side-link side-collapse" type="button" onClick={() => setCollapsed((value) => !value)}>
              <ChevronsLeft size={18} />
              <span>Collapse sidebar</span>
            </button>
          </div>
        </aside>
        <div className={cn("main", showDock && "has-dock")}>
          <header className="topbar">
            <label className="search-bar">
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Quick search"
                aria-label="Quick search"
              />
            </label>
            <div className="top-tools">
              <button className="icon-btn" type="button" aria-label="Notifications" onClick={() => setDrawer(true)}>
                <Bell size={18} />
                {shop.unread > 0 ? <em className="badge">{shop.unread > 9 ? "9+" : shop.unread}</em> : null}
              </button>
              <Link className="icon-btn" to="/app/workspace" aria-label="Workshop settings">
                <Settings size={18} />
              </Link>
            </div>
          </header>
          <div className="content">
            {shop.error ? <p className="banner">{shop.error}</p> : null}
            {!shop.ready ? (
              <div className="loading-copy">Loading the workshop…</div>
            ) : !shop.workspace ? (
              <Gate />
            ) : (
              <Outlet context={{ query }} />
            )}
          </div>
          {showDock ? (
            <div className="float-actions">
              {drafts.dirty ? (
                <button
                  className="btn dark"
                  type="button"
                  disabled={drafts.saving}
                  onClick={() => {
                    void drafts.saveAll().catch(() => undefined);
                  }}
                >
                  {drafts.saving ? "Saving" : "Save"}
                </button>
              ) : null}
              {shop.workspace && onWorkshop && isOwner ? (
                <button className="btn danger" type="button" onClick={() => setConfirmDelete(true)}>
                  Delete workshop
                </button>
              ) : null}
            </div>
          ) : null}
          <nav className="tabbar" aria-label="Sections">
            {TABS.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => cn("tab", isActive && "on")}>
                  <Icon size={18} />
                  <span>{item.label}</span>
                </NavLink>
              );
            })}
            <button className={cn("tab", navOpen && "on")} type="button" onClick={() => setNavOpen((open) => !open)}>
              <Menu size={18} />
              <span>Menu</span>
            </button>
          </nav>
        </div>
        {drawer ? (
          <div className="drawer-back" onMouseDown={() => setDrawer(false)}>
            <aside className="drawer" onMouseDown={(event) => event.stopPropagation()} aria-label="Notifications">
              <header>
                <h2>Notifications</h2>
                <button className="btn small ghost" type="button" onClick={() => void shop.markAllRead()} disabled={shop.unread === 0}>
                  Mark all read
                </button>
              </header>
              {shop.notices.length === 0 ? (
                <p className="muted">No alerts. Low spools and finished milestones land here.</p>
              ) : (
                <ul className="notice-list">
                  {shop.notices.map((notice) => (
                    <li key={notice.id} className={notice.read ? "read" : notice.kind}>
                      <button type="button" onClick={() => void shop.markRead(notice.id)}>
                        <i className="notice-mark" />
                        <strong>{notice.title}</strong>
                        <span>{notice.body}</span>
                        <em>{ago(notice.created)}</em>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          </div>
        ) : null}
        {confirmDelete ? (
          <Modal title="Delete this workshop?" subtitle="Spools, products, the board, and the print log go with it." onClose={() => setConfirmDelete(false)}>
            <div className="actions">
              <button className="btn ghost" type="button" onClick={() => setConfirmDelete(false)}>
                Keep it
              </button>
              <button
                className="btn danger"
                type="button"
                onClick={() => {
                  void shop.deleteWorkspace().then(() => setConfirmDelete(false)).catch(() => undefined);
                }}
              >
                Delete workshop
              </button>
            </div>
          </Modal>
        ) : null}
        <div className="toasts">
          {shop.toasts.map((item) => (
            <button key={item.id} type="button" className={cn("toast", item.tone)} onClick={() => shop.dismissToast(item.id)}>
              {item.text}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
