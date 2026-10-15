// Sample accounts for the preview shown while no contract is deployed. Addresses, names and
// batch IDs match Member C's verify-page sample data (pages/verify/mockContract.js), so the
// dashboard and the verify page tell the same story.
export const DEMO_ACCOUNTS = {
  manufacturer: {
    label: "Manufacturer",
    address: "0x1111111111111111111111111111111111111111",
    participant: { role: 1, name: "Sunrise Pharma Ltd", location: "Ahmedabad, IN", active: true },
  },
  distributor: {
    label: "Distributor",
    address: "0x2222222222222222222222222222222222222222",
    participant: { role: 2, name: "MedLink Distributors", location: "Mumbai, IN", active: true },
  },
  pharmacy: {
    label: "Pharmacy",
    address: "0x3333333333333333333333333333333333333333",
    participant: { role: 3, name: "CityCare Pharmacy", location: "Bengaluru, IN", active: true },
  },
  regulator: {
    label: "Regulator",
    address: "0x4444444444444444444444444444444444444444",
    participant: { role: 4, name: "Drug Regulator (sample)", location: "New Delhi, IN", active: true },
  },
};

export const DEMO_BATCH_IDS = ["PCM-2026-001", "AMX-2026-014", "IBU-2024-007"];
