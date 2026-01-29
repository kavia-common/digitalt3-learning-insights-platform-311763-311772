const { EntitySchema } = require('typeorm');

const ROLES = ['admin', 'instructor', 'learner'];

const UserEntity = new EntitySchema({
  name: 'User',
  tableName: 'users',
  columns: {
    id: {
      type: 'int',
      primary: true,
      generated: 'increment',
    },
    email: {
      type: 'varchar',
      length: 255,
      unique: true,
    },
    passwordHash: {
      type: 'varchar',
      length: 255,
      // Note: unlike Mongoose `select:false`, TypeORM will return it by default.
      // Routes MUST avoid returning passwordHash (and only select it when needed).
      nullable: false,
    },
    name: {
      type: 'varchar',
      length: 200,
    },
    role: {
      type: 'enum',
      enum: ROLES,
      default: 'learner',
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
  relations: {
    coursesCreated: {
      type: 'one-to-many',
      target: 'Course',
      inverseSide: 'createdBy',
    },
    coursesUpdated: {
      type: 'one-to-many',
      target: 'Course',
      inverseSide: 'updatedBy',
    },
  },
});

module.exports = { UserEntity, ROLES };
