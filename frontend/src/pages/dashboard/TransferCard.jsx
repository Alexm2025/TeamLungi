import { useEffect, useState } from "react";
import { isAddress } from "ethers";
import { Button, Card, Input } from "../../components/ui";
import { ROLE } from "./chain";
import { fetchParticipants, rememberBatch } from "./data";
import { useTx } from "./useTx";

const TITLES = {
  send: (id) => `Send ${id}`,
  accept: (id) => `Accept ${id}`,
  cancel: (id) => `Cancel transfer of ${id}`,
};

// Custody hand-over in three signed steps: the holder sends (initiateTransfer), the receiver
// accepts (acceptTransfer), and the regulator approves (approveTransfer, in the approval queue).
// Until the regulator approves, the sender can cancel.
// `actions` picks which buttons show; `lockId` fixes the batch (used on the batch page).
export default function TransferCard({
  batchId: initialId = "",
  lockId = false,
  actions = ["send", "accept", "cancel"],
  onDone,
}) {
  const [batchId, setBatchId] = useState(initialId);
  const [receiver, setReceiver] = useState("");
  const [receiverInfo, setReceiverInfo] = useState(null);
  const [errors, setErrors] = useState({});
  const [current, setCurrent] = useState(null); // which button is busy
  const { run } = useTx();
  const canSend = actions.includes("send");

  // Show who a valid address belongs to, so a typo is caught before anything is sent.
  useEffect(() => {
    const addr = receiver.trim();
    setReceiverInfo(null);
    if (!isAddress(addr)) return;
    let cancelled = false;
    fetchParticipants([addr])
      .then((found) => !cancelled && setReceiverInfo(found[addr.toLowerCase()]))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [receiver]);

  const act = async (kind) => {
    const id = batchId.trim();
    const to = receiver.trim();
    const problems = {};
    if (!id) problems.batchId = "Enter a batch ID";
    if (kind === "send" && !isAddress(to)) problems.receiver = "Enter a valid 0x… address";
    setErrors(problems);
    if (Object.keys(problems).length) return;

    setCurrent(kind);
    const receipt = await run(TITLES[kind](id), (c) => {
      if (kind === "send") return c.initiateTransfer(id, to);
      if (kind === "accept") return c.acceptTransfer(id);
      return c.cancelTransfer(id);
    });
    setCurrent(null);
    if (receipt) {
      rememberBatch(id);
      if (kind === "send") setReceiver("");
      onDone?.();
    }
  };

  const receiverHint = !receiverInfo
    ? "Wallet of the next holder (a distributor or pharmacy)"
    : receiverInfo.active
      ? `${receiverInfo.name} · ${ROLE[receiverInfo.role]} · ${receiverInfo.location}`
      : "Not a registered participant";

  return (
    <Card
      title={lockId ? "Hand-over" : "Transfer custody"}
      subtitle="3 signatures: you send, the receiver accepts, the regulator approves. Custody moves only after all three."
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          act(canSend ? "send" : actions[0]);
        }}
        noValidate
      >
        {!lockId && (
          <Input
            label="Batch ID"
            value={batchId}
            onChange={(e) => setBatchId(e.target.value)}
            error={errors.batchId}
            className="mono"
          />
        )}
        {canSend && (
          <Input
            label="Receiver address"
            value={receiver}
            onChange={(e) => setReceiver(e.target.value)}
            placeholder="0x…"
            error={errors.receiver}
            hint={receiverHint}
            className="mono"
          />
        )}
        <div className="form-actions">
          {canSend && (
            <Button type="submit" loading={current === "send"} disabled={Boolean(current)}>
              Send batch
            </Button>
          )}
          {actions.includes("accept") && (
            <Button
              variant={canSend ? "secondary" : "primary"}
              onClick={() => act("accept")}
              loading={current === "accept"}
              disabled={Boolean(current)}
            >
              Accept incoming
            </Button>
          )}
          {actions.includes("cancel") && (
            <Button
              variant="ghost"
              onClick={() => act("cancel")}
              loading={current === "cancel"}
              disabled={Boolean(current)}
            >
              Cancel pending transfer
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}
