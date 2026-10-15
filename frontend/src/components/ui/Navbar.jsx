import { Link, NavLink } from "react-router-dom";

// Top bar: brand on the left, page links in the middle, anything passed as children on the right.
export default function Navbar({ links, children }) {
  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="brand">
          <span className="brand-mark" aria-hidden="true">✚</span>
          MediChain
        </Link>
        <nav className="nav-links">
          {links.map((link) => (
            // NavLink adds the "active" class when its route matches; `end` stops "/" matching every page
            <NavLink key={link.to} to={link.to} end={link.end} className="nav-link">
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="navbar-actions">{children}</div>
      </div>
    </header>
  );
}
