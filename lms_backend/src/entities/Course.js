const { EntitySchema } = require('typeorm');

const COURSE_STATUSES = ['draft', 'published', 'archived'];

const CourseEntity = new EntitySchema({
  name: 'Course',
  tableName: 'courses',
  columns: {
    id: {
      type: 'int',
      primary: true,
      generated: 'increment',
    },
    title: {
      type: 'varchar',
      length: 200,
    },
    description: {
      type: 'text',
      nullable: false,
      default: '',
    },
    status: {
      type: 'enum',
      enum: COURSE_STATUSES,
      default: 'draft',
    },
    // Store tags as JSON array to preserve existing contract easily.
    tags: {
      type: 'json',
      nullable: false,
      default: () => '\'[]\'',
    },
    publishedAt: {
      type: 'datetime',
      nullable: true,
    },
    deletedAt: {
      type: 'datetime',
      nullable: true,
    },
    createdAt: {
      type: 'datetime',
      createDate: true,
    },
    updatedAt: {
      type: 'datetime',
      updateDate: true,
    },
  },
  indices: [
    { columns: ['status'] },
    { columns: ['publishedAt'] },
    { columns: ['deletedAt'] },
    { columns: ['createdAt'] },
  ],
  relations: {
    createdBy: {
      type: 'many-to-one',
      target: 'User',
      joinColumn: { name: 'createdById' },
      nullable: true,
      eager: false,
      onDelete: 'SET NULL',
    },
    updatedBy: {
      type: 'many-to-one',
      target: 'User',
      joinColumn: { name: 'updatedById' },
      nullable: true,
      eager: false,
      onDelete: 'SET NULL',
    },
    lessons: {
      type: 'one-to-many',
      target: 'Lesson',
      inverseSide: 'course',
    },
  },
});

module.exports = { CourseEntity, COURSE_STATUSES };
