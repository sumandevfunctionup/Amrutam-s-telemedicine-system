import swaggerJsdoc from 'swagger-jsdoc';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let appVersion = '2.1.0';
try {
  const packageJson = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, '../package.json'), 'utf8')
  );
  if (packageJson.version) {
    appVersion = packageJson.version;
  }
} catch (err) {
  // fallback to default version
}

const port = process.env.PORT || 3000;

const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: "Amrutam Telemedicine System API",
      version: appVersion,
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
