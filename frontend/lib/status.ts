export type Status = "supported" | "contradicted" | "outdated" | "unsupported" | "human_review";

export const STATUS: Record<Status, { label: string; color: string }> = {
    supported: { label: "Supported", color: "#3F8F6B" },
    contradicted: { label: "Contradicted", color: "#B85C55" },
    outdated: { label: "Outdated", color: "#D4A85A" },
    unsupported: { label: "Unsupported", color: "#218C84" },
    human_review: { label: "Human review", color: "#152A35" },
};

export type Finding = {
    finding_id: string; claim_id: string; claim_text: string; position: number;
    status: Status; confidence: number | null; // null when status is "unsupported"
    rule_type: string | null; explanation: string; safer_draft: string | null;
    evidence: { chunk_id: string; doc_title: string; valid_until: string | null; content: string }[];
};

export type SubmissionStatus =
    | "submitted"
    | "analyzed"
    | "in_review"
    | "approved"
    | "revise"
    | "rejected";

export const SUBMISSION_STATUS: Record<
    SubmissionStatus,
    { label: string; color: string; bg: string; text: string; dot: string }
> = {
    submitted: {
        label: "Submitted",
        color: "#218C84",
        bg: "#E4F1F0",
        text: "#1B6E67",
        dot: "#218C84",
    },
    analyzed: {
        label: "Analyzed",
        color: "#218C84",
        bg: "#EAF3F1",
        text: "#006f68",
        dot: "#218C84",
    },
    in_review: {
        label: "In Review",
        color: "#D4A85A",
        bg: "#FAF4E8",
        text: "#967129",
        dot: "#D4A85A",
    },
    approved: {
        label: "Approved",
        color: "#3F8F6B",
        bg: "#E8F4EE",
        text: "#3F8F6B",
        dot: "#3F8F6B",
    },
    revise: {
        label: "Revision Requested",
        color: "#D4A85A",
        bg: "#FAF4E8",
        text: "#967129",
        dot: "#D4A85A",
    },
    rejected: {
        label: "Rejected",
        color: "#B85C55",
        bg: "#F7EBEA",
        text: "#B85C55",
        dot: "#B85C55",
    },
};

export type Submission = {
    id: string;
    creator_id: string;
    title: string;
    content_text: string;
    guideline_id: string | null;
    status: SubmissionStatus;
    created_at: string;
    decided_at?: string | null;
};

export type DecisionType = "approve" | "revise" | "reject";

export type DecisionRecord = {
    decision: DecisionType;
    comment: string | null;
    created_at: string;
    reviewer_id: string;
};

export type ReviewQueueItem = Submission & {
    finding_counts: Record<Status | string, number>;
};
