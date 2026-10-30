// Form definitions. The agent, the rules engine and the UI all read from here.
// Adding a new journey = adding a new schema (plus its rules in lib/rules.js).

export const SCHEMAS = {
  health_claim: {
    id: 'health_claim',
    title: 'Health insurance claim',
    subtitle: 'Paytm Health Shield · Reimbursement claim',
    groups: [
      {
        title: 'Policy',
        fields: [
          { key: 'policyNumber', label: 'Policy number', type: 'text', required: true },
          { key: 'policyHolder', label: 'Policy holder', type: 'text', required: true },
        ],
      },
      {
        title: 'Patient',
        fields: [
          { key: 'patientName', label: 'Patient name', type: 'text', required: true },
          { key: 'relationship', label: 'Relationship', type: 'enum', options: ['Self', 'Spouse', 'Father', 'Mother', 'Son', 'Daughter'], required: true },
        ],
      },
      {
        title: 'Hospital stay',
        fields: [
          { key: 'hospitalName', label: 'Hospital', type: 'text', required: true },
          { key: 'admissionDate', label: 'Admitted on', type: 'date', required: true },
          { key: 'dischargeDate', label: 'Discharged on', type: 'date', required: true },
          { key: 'diagnosis', label: 'Diagnosis', type: 'text', required: true },
        ],
      },
      {
        title: 'Amount & payout',
        fields: [
          { key: 'claimAmount', label: 'Claim amount (₹)', type: 'number', required: true },
          { key: 'upiId', label: 'Payout UPI ID', type: 'text', required: true },
        ],
      },
    ],
    documents: [
      { key: 'hospitalBill', label: 'Final hospital bill', required: true },
      { key: 'dischargeSummary', label: 'Discharge summary', required: true },
    ],
    // Fields filled from the logged-in Paytm account / linked policy at start
    prefill: ['policyNumber', 'policyHolder', 'upiId'],
  },

  loan_precheck: {
    id: 'loan_precheck',
    title: 'Personal loan pre-check',
    subtitle: 'Instant eligibility · no impact on credit score',
    groups: [
      {
        title: 'You',
        fields: [
          { key: 'fullName', label: 'Full name', type: 'text', required: true },
          { key: 'mobile', label: 'Mobile', type: 'text', required: true },
          { key: 'pan', label: 'PAN', type: 'text', required: true },
        ],
      },
      {
        title: 'Income',
        fields: [
          { key: 'employmentType', label: 'Employment', type: 'enum', options: ['Salaried', 'Self-employed'], required: true },
          { key: 'monthlyIncome', label: 'Monthly income (₹)', type: 'number', required: true },
          { key: 'existingEmi', label: 'Existing EMIs (₹/month)', type: 'number', required: true },
        ],
      },
      {
        title: 'Loan',
        fields: [
          { key: 'loanAmount', label: 'Loan amount (₹)', type: 'number', required: true },
          { key: 'tenureMonths', label: 'Tenure (months)', type: 'number', required: true },
          { key: 'purpose', label: 'Purpose', type: 'text', required: false },
          { key: 'disbursalUpi', label: 'Disburse to UPI', type: 'text', required: true },
        ],
      },
    ],
    documents: [],
    prefill: ['fullName', 'mobile', 'pan', 'disbursalUpi'],
  },
};

export function allFields(schema) {
  return schema.groups.flatMap((g) => g.fields);
}

export function fieldDef(schema, key) {
  return allFields(schema).find((f) => f.key === key);
}
