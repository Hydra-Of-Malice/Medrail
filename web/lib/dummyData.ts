/** Illustrative demo data for the patient dashboard (components/UserPanel.tsx).
 * Addresses are freshly-generated, unfunded TestNet keypairs — nobody's real
 * identity, no relation to the on-chain history rendered elsewhere on this
 * page. Approving or revoking a row still submits a real, patient-signed
 * transaction against the deployed MedRailConsent contract. */

export const SCOPE = "records:summary";

export interface PatientProfile {
  name: string;
  dateOfBirth: string;
  bloodType: string;
  allergies: string[];
  chronicConditions: string[];
  currentMedications: string[];
  memberSince: string;
}

export const PATIENT_PROFILE: PatientProfile = {
  name: "Alex Rivera",
  dateOfBirth: "1988-04-12",
  bloodType: "O+",
  allergies: ["penicillin"],
  chronicConditions: ["type 2 diabetes (controlled)"],
  currentMedications: ["metformin 500mg", "lisinopril 10mg"],
  memberSince: "2025-11-02",
};

export type AccessStatus = "pending" | "granted" | "revoked";

export interface AccessEntry {
  id: string;
  requesterName: string;
  requesterRole: string;
  requesterAddress: string;
  scope: string;
  endpoint: string;
  requestedAt: string;
  status: AccessStatus;
  blacklisted: boolean;
  note?: string;
}

export const BLACKLISTED_ADDRESSES: ReadonlySet<string> = new Set([
  "ESSKOP3HCXWNSMLSXFO6J7NBEHIT4UNGUEUQQBKUP3EAY656HRBX55L6HE",
  "EESMTLMC4O24E6WTFSJ5EN6XFPGNAN7MEHQLMFN7QOWQZWT2FJCM5HTCAM",
]);

export const DUMMY_ACCESS_LOG: AccessEntry[] = [
  {
    id: "acc-1",
    requesterName: "Cardiology Partner Clinic",
    requesterRole: "Referred specialist — records review",
    requesterAddress: "H2JER5GNPL7OY4XNSA7VJO2BOHDQEDDEUEIG2JNB67TUKJT7H6IVULUHZY",
    scope: SCOPE,
    endpoint: "/v1/records/summary",
    requestedAt: "2026-08-20T14:02:00Z",
    status: "granted",
    blacklisted: false,
  },
  {
    id: "acc-2",
    requesterName: "Insurance Verification Bot",
    requesterRole: "Claims pre-authorization agent",
    requesterAddress: "PKVY3J6LJYWHJX4UUBPNMP5FTAJBN4OZWIGOSNUVU7D6EHLK7MNDZ4BXDQ",
    scope: SCOPE,
    endpoint: "/v1/records/summary",
    requestedAt: "2026-08-21T09:41:00Z",
    status: "pending",
    blacklisted: false,
  },
  {
    id: "acc-3",
    requesterName: "Unknown Data Broker",
    requesterRole: "Unverified third party",
    requesterAddress: "ESSKOP3HCXWNSMLSXFO6J7NBEHIT4UNGUEUQQBKUP3EAY656HRBX55L6HE",
    scope: SCOPE,
    endpoint: "/v1/records/summary",
    requestedAt: "2026-08-22T03:17:00Z",
    status: "pending",
    blacklisted: true,
    note: "Flagged by MedRail's registry for reselling access grants.",
  },
  {
    id: "acc-4",
    requesterName: "Second Opinion AI Network",
    requesterRole: "Independent diagnostic review",
    requesterAddress: "VRH766DF2YTHAPUZJONQKJNORVY3H4JNY3XINU4BT5IQFOY5AYHHDQ3OQE",
    scope: SCOPE,
    endpoint: "/v1/records/summary",
    requestedAt: "2026-08-18T11:00:00Z",
    status: "revoked",
    blacklisted: false,
  },
  {
    id: "acc-5",
    requesterName: "Flagged Marketing Analytics LLC",
    requesterRole: "Unsolicited data-access request",
    requesterAddress: "EESMTLMC4O24E6WTFSJ5EN6XFPGNAN7MEHQLMFN7QOWQZWT2FJCM5HTCAM",
    scope: SCOPE,
    endpoint: "/v1/records/summary",
    requestedAt: "2026-08-22T18:30:00Z",
    status: "pending",
    blacklisted: true,
    note: "Flagged: no clinical relationship on file.",
  },
];
