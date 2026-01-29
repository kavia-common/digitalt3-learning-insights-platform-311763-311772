class InitUsersCoursesLessons1700000000000 {
  name = 'InitUsersCoursesLessons1700000000000';

  // PUBLIC_INTERFACE
  async up(queryRunner) {
    /** Apply initial schema for users/courses/lessons. */
    // users
    await queryRunner.query(
      'CREATE TABLE `users` (`id` int NOT NULL AUTO_INCREMENT, `email` varchar(255) NOT NULL, `passwordHash` varchar(255) NOT NULL, `name` varchar(200) NOT NULL, `role` enum (\'admin\',\'instructor\',\'learner\') NOT NULL DEFAULT \'learner\', `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX `IDX_users_email_unique` (`email`), PRIMARY KEY (`id`)) ENGINE=InnoDB'
    );

    // courses
    await queryRunner.query(
      'CREATE TABLE `courses` (`id` int NOT NULL AUTO_INCREMENT, `title` varchar(200) NOT NULL, `description` text NOT NULL, `status` enum (\'draft\',\'published\',\'archived\') NOT NULL DEFAULT \'draft\', `tags` json NOT NULL, `publishedAt` datetime NULL, `deletedAt` datetime NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), `createdById` int NULL, `updatedById` int NULL, INDEX `IDX_courses_status` (`status`), INDEX `IDX_courses_publishedAt` (`publishedAt`), INDEX `IDX_courses_deletedAt` (`deletedAt`), INDEX `IDX_courses_createdAt` (`createdAt`), PRIMARY KEY (`id`)) ENGINE=InnoDB'
    );

    await queryRunner.query(
      'ALTER TABLE `courses` ADD CONSTRAINT `FK_courses_createdById_users_id` FOREIGN KEY (`createdById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION'
    );
    await queryRunner.query(
      'ALTER TABLE `courses` ADD CONSTRAINT `FK_courses_updatedById_users_id` FOREIGN KEY (`updatedById`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION'
    );

    // lessons
    await queryRunner.query(
      'CREATE TABLE `lessons` (`id` int NOT NULL AUTO_INCREMENT, `title` varchar(200) NOT NULL, `content` longtext NOT NULL, `order` int NOT NULL DEFAULT 0, `status` enum (\'draft\',\'published\',\'archived\') NOT NULL DEFAULT \'draft\', `deletedAt` datetime NULL, `createdAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), `updatedAt` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), `courseId` int NOT NULL, INDEX `IDX_lessons_deletedAt` (`deletedAt`), INDEX `IDX_lessons_createdAt` (`createdAt`), PRIMARY KEY (`id`)) ENGINE=InnoDB'
    );

    await queryRunner.query(
      'ALTER TABLE `lessons` ADD CONSTRAINT `FK_lessons_courseId_courses_id` FOREIGN KEY (`courseId`) REFERENCES `courses`(`id`) ON DELETE CASCADE ON UPDATE NO ACTION'
    );
  }

  // PUBLIC_INTERFACE
  async down(queryRunner) {
    /** Revert initial schema for users/courses/lessons. */
    // drop FKs first
    await queryRunner.query('ALTER TABLE `lessons` DROP FOREIGN KEY `FK_lessons_courseId_courses_id`');
    await queryRunner.query('ALTER TABLE `courses` DROP FOREIGN KEY `FK_courses_updatedById_users_id`');
    await queryRunner.query('ALTER TABLE `courses` DROP FOREIGN KEY `FK_courses_createdById_users_id`');

    // then tables
    await queryRunner.query('DROP TABLE `lessons`');
    await queryRunner.query('DROP TABLE `courses`');
    await queryRunner.query('DROP TABLE `users`');
  }
}

module.exports = { InitUsersCoursesLessons1700000000000 };

