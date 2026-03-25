-- AlterTable
ALTER TABLE `Robot` ADD COLUMN `heading` DOUBLE NULL,
    ADD COLUMN `positionX` DOUBLE NULL,
    ADD COLUMN `positionY` DOUBLE NULL;

-- CreateTable
CREATE TABLE `Point` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `x` DOUBLE NOT NULL,
    `y` DOUBLE NOT NULL,
    `theta` DOUBLE NOT NULL DEFAULT 0,
    `description` VARCHAR(191) NULL,

    UNIQUE INDEX `Point_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GraspObject` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `imageUrl` VARCHAR(191) NULL,
    `available` BOOLEAN NOT NULL DEFAULT true,
    `locationId` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Mission` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `type` ENUM('TRANSPORT', 'PICK_AND_PLACE') NOT NULL,
    `status` ENUM('PENDING', 'NAVIGATING_TO_PICKUP', 'WAITING_FOR_LOAD', 'NAVIGATING_TO_DESTINATION', 'DETECTING_OBJECT', 'GRASPING', 'TRANSPORTING', 'DEPOSITING', 'COMPLETED', 'FAILED', 'CANCELLED', 'PAUSED') NOT NULL DEFAULT 'PENDING',
    `userId` INTEGER NOT NULL,
    `fromPointId` INTEGER NOT NULL,
    `toPointId` INTEGER NOT NULL,
    `robotId` INTEGER NULL,
    `objectId` INTEGER NULL,
    `failureReason` VARCHAR(191) NULL,
    `graspAttempts` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `GraspObject` ADD CONSTRAINT `GraspObject_locationId_fkey` FOREIGN KEY (`locationId`) REFERENCES `Point`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Mission` ADD CONSTRAINT `Mission_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Mission` ADD CONSTRAINT `Mission_fromPointId_fkey` FOREIGN KEY (`fromPointId`) REFERENCES `Point`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Mission` ADD CONSTRAINT `Mission_toPointId_fkey` FOREIGN KEY (`toPointId`) REFERENCES `Point`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Mission` ADD CONSTRAINT `Mission_robotId_fkey` FOREIGN KEY (`robotId`) REFERENCES `Robot`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Mission` ADD CONSTRAINT `Mission_objectId_fkey` FOREIGN KEY (`objectId`) REFERENCES `GraspObject`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
