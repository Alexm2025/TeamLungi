import { useState } from "react";
import { isAddress } from "ethers";
import { Button, Card, Input, Select } from "../../components/ui";
import { ROLE } from "./chain";
import { useTx } from "./useTx";
import { useWallet } from "./WalletContext";

const EMPTY = { address: "", role: "1", name: "", location: "" };
const ROLE_OPTIONS = [1, 2, 3, 4].map((r) => ({ value: String(r), label: ROLE[r] }));

// Admin only: give a wallet address a role in the supply chain.
export default function RegisterParticipant() {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const { run, busy } = useTx();
  const { refresh } = useWallet();

  const set = (key) => (e) => {
    const value = e.target.value;
    setForm((f) => ({ ...f, [key]: value }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    const address = form.address.trim();
    const name = form.name.trim();
    const location = form.location.trim();

    const problems = {};
    if (!isAddress(address)) problems.address = "Enter a valid 0x… wallet address";
    if (!name) problems.name = "Required";
    if (!location) problems.location = "Required";
    setErrors(problems);
    if (Object.keys(problems).length) return;

    const receipt = await run(`Register ${name}`, (c) =>
      c.registerParticipant(address, Number(form.role), name, location)
    );
    if (receipt) {
      setForm(EMPTY);
      refresh(); // in case the admin just registered their own address
    }
  };

  return (
    <Card title="Register participant" subtitle="Give a wallet a role in the supply chain.">
      <form onSubmit={onSubmit} noValidate>
        <Input
          label="Wallet address"
          value={form.address}
          onChange={set("address")}
          placeholder="0x…"
          error={errors.address}
          className="mono"
        />
        <Select label="Role" value={form.role} onChange={set("role")} options={ROLE_OPTIONS} />
        <div className="form-row">
          <Input label="Name" value={form.name} onChange={set("name")} error={errors.name} placeholder="Apollo Pharmacy" />
          <Input label="Location" value={form.location} onChange={set("location")} error={errors.location} placeholder="Mangaluru" />
        </div>
        <Button type="submit" loading={busy}>
          Register
        </Button>
      </form>
    </Card>
  );
}
