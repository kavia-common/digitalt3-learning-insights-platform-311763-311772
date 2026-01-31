const { EntitySchema } = require('typeorm');

const LESSON_STATUSES = ['draft', 'published', 'archived'];

const LessonEntity = new EntitySchema({
  name: 'Lesson',
  tableName: 'lessons',
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
    content: {
      type: 'longtext',
      nullable: false,
      default: '',
    },

    /**
     * Video fields (persisted):
     * - videoUrl: stores the S3 object key (NOT a public URL)
     * - duration: integer duration in minutes
     */
    videoUrl: {
      type: 'varchar',
      length: 1024,
      nullable: true,
    },
    duration: {
      type: 'int',
      nullable: true,
    },

    /**
     * AI generated fields (persisted):
     * - aiSummary: concise 3-paragraph summary (stored in MySQL TEXT)
     * - aiQuizJson: JSON array of 5 MCQs
     */
    aiSummary: {
      type: 'text',
      nullable: true,
    },
    aiQuizJson: {
      type: 'json',
      nullable: true,
    },

    order: {
      // Keep name "order" for API compatibility; works in MySQL but is a reserved word in SQL.
      // TypeORM will quote it as needed.
      type: 'int',
      nullable: false,
      default: 0,
    },
    status: {
      type: 'enum',
      enum: LESSON_STATUSES,
      default: 'draft',
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
  indices: [{ columns: ['deletedAt'] }, { columns: ['createdAt'] }],
  relations: {
    course: {
      type: 'many-to-one',
      target: 'Course',
      joinColumn: { name: 'courseId' },
      nullable: false,
      eager: false,
      onDelete: 'CASCADE',
    },
  },
});

module.exports = { LessonEntity, LESSON_STATUSES };
