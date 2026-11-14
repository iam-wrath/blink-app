-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "regionId" TEXT NOT NULL,
    "x" REAL NOT NULL,
    "y" REAL NOT NULL,
    "ra" REAL NOT NULL,
    "dec" REAL NOT NULL,
    "fluxDiff" REAL NOT NULL,
    "confidence" REAL NOT NULL,
    "knownName" TEXT,
    "knownSepArc" REAL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
