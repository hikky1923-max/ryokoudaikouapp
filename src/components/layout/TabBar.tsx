import { NavLink } from "react-router-dom";

export function TabBar() {
  return (
    <nav className="tab-bar">
      <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
        旅行一覧
      </NavLink>
      <div className="spacer" />
      <NavLink to="/settings" className="settings-link">
        ⚙ 設定
      </NavLink>
    </nav>
  );
}
