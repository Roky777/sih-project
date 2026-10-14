import { CurrentCaseControls } from "./CaseWorkspace";

/** Context comes from persisted case relationships, never a generic workflow footer. */
export function WorkspaceConnections() { return <CurrentCaseControls/>; }
