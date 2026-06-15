-- CreateTable
CREATE TABLE `MappingSession` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `robotId` INTEGER NOT NULL,
    `startedById` INTEGER NOT NULL,
    `state` ENUM('STARTING', 'RUNNING', 'STOPPING', 'STOPPED', 'FAILED') NOT NULL,
    `failureReason` VARCHAR(191) NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `endedAt` DATETIME(3) NULL,
    `coverageM2` DOUBLE NULL,
    `durationSec` INTEGER NULL,

    INDEX `MappingSession_robotId_startedAt_idx`(`robotId`, `startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MapSnapshot` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `sessionId` INTEGER NOT NULL,
    `robotId` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `pgmPath` VARCHAR(191) NOT NULL,
    `yamlPath` VARCHAR(191) NOT NULL,
    `pngPath` VARCHAR(191) NOT NULL,
    `widthPx` INTEGER NOT NULL,
    `heightPx` INTEGER NOT NULL,
    `resolutionM` DOUBLE NOT NULL,
    `originX` DOUBLE NOT NULL,
    `originY` DOUBLE NOT NULL,
    `originTheta` DOUBLE NOT NULL,
    `sizeBytes` INTEGER NOT NULL,
    `isCurrent` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MapSnapshot_robotId_createdAt_idx`(`robotId`, `createdAt`),
    INDEX `MapSnapshot_robotId_isCurrent_idx`(`robotId`, `isCurrent`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Annotation` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `mapSnapshotId` INTEGER NOT NULL,
    `sessionId` INTEGER NULL,
    `label` VARCHAR(191) NOT NULL,
    `icon` VARCHAR(191) NULL,
    `color` VARCHAR(191) NOT NULL DEFAULT '#3b82f6',
    `x` DOUBLE NOT NULL,
    `y` DOUBLE NOT NULL,
    `createdById` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Annotation_mapSnapshotId_idx`(`mapSnapshotId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SshAuditLog` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `robotId` INTEGER NOT NULL,
    `userId` INTEGER NOT NULL,
    `mode` ENUM('ALLOWLIST', 'ELEVATED') NOT NULL,
    `command` TEXT NOT NULL,
    `exitCode` INTEGER NULL,
    `durationMs` INTEGER NULL,
    `ipAddr` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `SshAuditLog_robotId_createdAt_idx`(`robotId`, `createdAt`),
    INDEX `SshAuditLog_userId_createdAt_idx`(`userId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `MappingSession` ADD CONSTRAINT `MappingSession_robotId_fkey` FOREIGN KEY (`robotId`) REFERENCES `Robot`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MappingSession` ADD CONSTRAINT `MappingSession_startedById_fkey` FOREIGN KEY (`startedById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MapSnapshot` ADD CONSTRAINT `MapSnapshot_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `MappingSession`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `MapSnapshot` ADD CONSTRAINT `MapSnapshot_robotId_fkey` FOREIGN KEY (`robotId`) REFERENCES `Robot`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Annotation` ADD CONSTRAINT `Annotation_mapSnapshotId_fkey` FOREIGN KEY (`mapSnapshotId`) REFERENCES `MapSnapshot`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Annotation` ADD CONSTRAINT `Annotation_sessionId_fkey` FOREIGN KEY (`sessionId`) REFERENCES `MappingSession`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Annotation` ADD CONSTRAINT `Annotation_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SshAuditLog` ADD CONSTRAINT `SshAuditLog_robotId_fkey` FOREIGN KEY (`robotId`) REFERENCES `Robot`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `SshAuditLog` ADD CONSTRAINT `SshAuditLog_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
