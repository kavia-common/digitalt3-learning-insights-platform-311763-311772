class AddLessonVideoFields1700000000200 {
  name = 'AddLessonVideoFields1700000000200';

  // PUBLIC_INTERFACE
  async up(queryRunner) {
    /** Add video fields to lessons: videoUrl (varchar) and duration (int). */
    await queryRunner.query('ALTER TABLE `lessons` ADD COLUMN `videoUrl` varchar(1024) NULL');
    await queryRunner.query('ALTER TABLE `lessons` ADD COLUMN `duration` int NULL');
  }

  // PUBLIC_INTERFACE
  async down(queryRunner) {
    /** Remove video fields from lessons. */
    await queryRunner.query('ALTER TABLE `lessons` DROP COLUMN `duration`');
    await queryRunner.query('ALTER TABLE `lessons` DROP COLUMN `videoUrl`');
  }
}

module.exports = { AddLessonVideoFields1700000000200 };
