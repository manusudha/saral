// Form definitions. Which fields apply and which are required is decided by lib/rules.js
// (e.g. discharge date only for a discharged patient). The UI reads status.applicable / status.required.

export const SCHEMAS = {
  health_claim: {
    id: 'health_claim',
    title: 'Health insurance claim',
    subtitle: 'Paytm Health Shield · Family floater',
    groups: [
      {
        title: 'Policy',
        fields: [
          { key: 'policyNumber', label: 'Policy number', type: 'text' },
          { key: 'policyHolder', label: 'Policy holder', type: 'text' },
        ],
      },
      {
        title: 'Patient',
        fields: [
          { key: 'relationship', label: 'Relationship to you', type: 'enum', options: ['Self', 'Spouse', 'Father', 'Mother', 'Son', 'Daughter', 'Brother', 'Sister', 'Other'] },
          { key: 'patientName', label: 'Patient name', type: 'text' },
        ],
      },
      {
        title: 'Hospital',
        fields: [
          { key: 'hospitalName', label: 'Hospital', type: 'text' },
          { key: 'hospitalCity', label: 'City', type: 'text' },
          { key: 'admissionStatus', label: 'Patient status', type: 'enum', options: ['Currently admitted', 'Discharged'] },
          { key: 'cashlessStatus', label: 'Cashless used?', type: 'enum', options: ['Not used', 'Rejected'] },
          { key: 'cashlessRejectionReason', label: 'Cashless rejection reason', type: 'text' },
        ],
      },
      {
        title: 'Treatment',
        fields: [
          { key: 'admissionDate', label: 'Admitted on', type: 'date' },
          { key: 'dischargeDate', label: 'Discharged on', type: 'date' },
          { key: 'diagnosis', label: 'Diagnosis', type: 'text' },
          { key: 'estimatedCost', label: 'Estimated treatment cost (₹)', type: 'number' },
          { key: 'claimAmount', label: 'Final bill amount (₹)', type: 'number' },
        ],
      },
      {
        title: 'Payout',
        fields: [{ key: 'upiId', label: 'Payout UPI ID', type: 'text' }],
      },
    ],
    documents: [
      { key: 'hospitalBill', label: 'Final hospital bill' },
      { key: 'dischargeSummary', label: 'Discharge summary' },
      { key: 'preAuthForm', label: 'Pre-authorisation form (from hospital desk)' },
      { key: 'rejectionLetter', label: 'Cashless rejection letter' },
      { key: 'paymentReceipt', label: 'Payment receipt' },
      { key: 'pharmacyBill', label: 'Pharmacy bills' },
      { key: 'diagnosticReport', label: 'Diagnostic reports' },
      { key: 'prescription', label: 'Prescription' },
    ],
  },

  loan_precheck: {
    id: 'loan_precheck',
    title: 'Personal loan — eligibility check',
    subtitle: 'Indicative estimate · no impact on credit score',
    groups: [
      {
        title: 'You',
        fields: [
          { key: 'fullName', label: 'Full name', type: 'text' },
          { key: 'mobile', label: 'Mobile', type: 'text' },
          { key: 'dob', label: 'Date of birth', type: 'date' },
          { key: 'pincode', label: 'Residential PIN code', type: 'text' },
          { key: 'city', label: 'City', type: 'text' },
          { key: 'pan', label: 'PAN', type: 'text', sensitive: true },
        ],
      },
      {
        title: 'Work and income',
        fields: [
          { key: 'employmentType', label: 'Employment', type: 'enum', options: ['Salaried', 'Self-employed'] },
          { key: 'employerName', label: 'Employer', type: 'text' },
          { key: 'businessName', label: 'Business name', type: 'text' },
          { key: 'workExperienceYears', label: 'Work experience (years)', type: 'number' },
          { key: 'monthlyIncome', label: 'Monthly income (₹)', type: 'number' },
          { key: 'salaryBank', label: 'Salary account bank', type: 'text' },
        ],
      },
      {
        title: 'Existing obligations',
        fields: [
          { key: 'existingEmi', label: 'Existing EMIs (₹/month)', type: 'number' },
          { key: 'creditCardDues', label: 'Credit card outstanding (₹)', type: 'number' },
        ],
      },
      {
        title: 'Loan',
        fields: [
          { key: 'loanAmount', label: 'Loan amount (₹)', type: 'number' },
          { key: 'tenureMonths', label: 'Tenure (months)', type: 'number' },
          { key: 'purpose', label: 'Purpose', type: 'text' },
          { key: 'disbursalUpi', label: 'Disburse to UPI', type: 'text' },
        ],
      },
    ],
    documents: [],
  },
};

export function allFields(schema) {
  return schema.groups.flatMap((g) => g.fields);
}

export function fieldDef(schema, key) {
  return allFields(schema).find((f) => f.key === key);
}
