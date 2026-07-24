export type Resource = {
  title: string;
  description: string;
  href: string;
  kind: "document" | "folder";
};

export const BUSINESS_TRAVEL_POLICY: Resource = {
  title: "Business Travel Policy",
  description:
    "Approval requirements, allowable expenses, per-diems, and receipt rules for all Heritage Lab travel.",
  href: "https://docs.google.com/document/d/1ZgUpr8vWLc-8HSDmLzk9ahoavPluXTZtu7PC_u2O8g4/edit?usp=sharing",
  kind: "document",
};

export const BOARD_GENERAL_FOLDER: Resource = {
  title: "Board of Directors — General Folder",
  description:
    "Meeting packages, minutes, and governance documents. Restricted to Board members.",
  href: "https://drive.google.com/drive/folders/1SR4it44SbYxt6O2RG3fh_ucX6Hw0kcsZ?usp=sharing",
  kind: "folder",
};
