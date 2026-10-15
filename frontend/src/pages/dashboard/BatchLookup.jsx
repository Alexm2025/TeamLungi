import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, Input } from "../../components/ui";

// Jump to any batch's detail page by its ID.
export default function BatchLookup() {
  const [batchId, setBatchId] = useState("");
  const navigate = useNavigate();

  const onSubmit = (e) => {
    e.preventDefault();
    const id = batchId.trim();
    if (id) navigate(`/dashboard/batch/${encodeURIComponent(id)}`);
  };

  return (
    <Card title="Find a batch" subtitle="Open a batch's details and custody history.">
      <form onSubmit={onSubmit} className="inline-form">
        <Input
          label="Batch ID"
          value={batchId}
          onChange={(e) => setBatchId(e.target.value)}
          placeholder="MED-20261015-K3F9"
          className="mono"
        />
        <Button type="submit" variant="secondary">
          Open
        </Button>
      </form>
    </Card>
  );
}
