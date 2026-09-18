import swaggerJsdoc from 'swagger-jsdoc';

const port = process.env.PORT || 3000;

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: "Amrutam Telemedicine System API",
      version: '1.0.0',
      description:
        'RESTful API documentation for Amrutam Telemedicine System, built with Express.js, Knex, and PostgreSQL.',
      contact: {
        name: 'Amrutam Engineering Team',
      },
    },
    servers: [
      {
        url: `http://localhost:${port}`,
        description: 'Local Development Server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter JWT bearer token for authorization.',
        },
      },
    },
  },
  apis: ['./router/*.js', './router/**/*.js', './controller/*.js'],
};

export const swaggerSpec = swaggerJsdoc(swaggerOptions);
