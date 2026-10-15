// DEV ONLY: while the mock contract is in use, pick which role the connected
// wallet plays so each dashboard can be previewed. Hidden once USING_MOCK is false.
import { useState } from "react";
import { ROLE, USING_MOCK } from "./chain";
import { getMockRole, setMockRole } from "./mockContract";
import { useWallet } from "./WalletContext";

export default function MockRoleSwitcher() {
  const { refresh } = useWallet();
  const [role, setRole] = useState(getMockRole);

  if (!USING_MOCK) return null;

  const onChange = (e) => {
    const next = Number(e.target.value);
    setMockRole(next);
    setRole(next);
    refresh();
  };

  return (
    <label className="mock-switcher" title="Mock contract: choose the role to preview">
      <span>Mock role</span>
      <select value={role} onChange={onChange}>
        {Object.entries(ROLE).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </label>
  );
}
