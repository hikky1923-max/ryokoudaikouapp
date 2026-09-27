import { NavLink } from "react-router-dom";

export function TabBar() {
  return (
    <nav className="tab-bar">
      <NavLink to="/" end className={({ isActive }) => (isActive ? "active" : "")}>
        旅行一覧
      </NavLink>
    </nav>
  );
}
