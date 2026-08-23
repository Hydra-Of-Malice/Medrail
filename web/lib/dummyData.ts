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

/** Illustrative data for the doctor/hospital view (components/DoctorPanel.tsx).
 * Same disclaimer as above: fresh unfunded addresses, no relation to any real
 * patient. `record` mirrors api/src/routes/records.ts's SYNTHETIC_RECORD shape
 * so the "See" button can hand it straight to /v1/summarize either way. */
export type HospitalAccessStatus = "granted" | "requested" | "none";

export interface HospitalPatientRecord {
  bloodType: string;
  allergies: string[];
  chronicConditions: string[];
  currentMedications: string[];
  lastUpdated: string;
}

export interface HospitalPatient {
  id: string;
  name: string;
  address: string;
  accessStatus: HospitalAccessStatus;
  lastVisit: string;
  record: HospitalPatientRecord;
  history: string;
}

export const DOCTOR_SCOPE = SCOPE;

export const HOSPITAL_PATIENTS: HospitalPatient[] = [
  {
    id: "pt-1",
    name: "Jordan Blake",
    address: "ZPKYWCRWO5AQBI2VRNQCUAPW7QMJLS2LDW5EIYTY7QEQEKY3D4WBVX336I",
    accessStatus: "granted",
    lastVisit: "2026-08-10",
    record: {
      bloodType: "A-",
      allergies: ["sulfa drugs"],
      chronicConditions: ["hypertension", "asthma (mild, exercise-induced)"],
      currentMedications: ["lisinopril 10mg", "albuterol inhaler PRN"],
      lastUpdated: "2026-08-10",
    },
    history:
      "2026-06-02: Presented with intermittent shortness of breath during exercise, mild wheeze on " +
      "exam. Started albuterol PRN. 2026-07-14: Follow-up — symptoms well controlled, BP 138/88, " +
      "lisinopril dose unchanged. 2026-08-10: Routine check-in, no new complaints, adherent to meds.",
  },
  {
    id: "pt-2",
    name: "Sam Okafor",
    address: "MBUF432XOS44KF5H2C4FRZBGWLV7WNJQ4OFOMCYCGMQUKUTNUUFGKPD6TE",
    accessStatus: "requested",
    lastVisit: "2026-07-22",
    record: {
      bloodType: "B+",
      allergies: [],
      chronicConditions: ["migraine (episodic)"],
      currentMedications: ["sumatriptan PRN"],
      lastUpdated: "2026-07-22",
    },
    history:
      "2026-05-30: New patient visit, reports migraines roughly twice a month, no aura. Prescribed " +
      "sumatriptan PRN. 2026-07-22: Reports migraines reduced to about once a month since starting a " +
      "sleep-hygiene routine alongside the medication.",
  },
  {
    id: "pt-3",
    name: "Priya Nandan",
    address: "774IJABSKTJMAG7ES4F2YE4WGSK2OI52VAK5MVTJOO7DHWUHYDTUXACK2E",
    accessStatus: "none",
    lastVisit: "2026-06-15",
    record: {
      bloodType: "O-",
      allergies: ["latex"],
      chronicConditions: [],
      currentMedications: [],
      lastUpdated: "2026-06-15",
    },
    history: "2026-06-15: Referred from urgent care after a minor fall; imaging clear, no follow-up scheduled.",
  },
  {
    id: "pt-4",
    name: "Theo Marsh",
    address: "M6YJ7XSEXHBSBM5IMMY3SDJ5XY6FTAL754PFW5JH6LWZOGWWZXXCGLFRII",
    accessStatus: "granted",
    lastVisit: "2026-08-19",
    record: {
      bloodType: "AB+",
      allergies: ["penicillin", "shellfish"],
      chronicConditions: ["type 1 diabetes", "hypothyroidism"],
      currentMedications: ["insulin glargine", "insulin lispro PRN", "levothyroxine 75mcg"],
      lastUpdated: "2026-08-19",
    },
    history:
      "2026-04-11: A1C 7.8%, adjusted insulin glargine dose upward. 2026-06-20: TSH slightly elevated, " +
      "levothyroxine increased to 75mcg. 2026-08-19: A1C improved to 7.1%, TSH now in range, reports " +
      "occasional overnight hypoglycemia — advised to recheck bedtime dosing.",
  },
];
