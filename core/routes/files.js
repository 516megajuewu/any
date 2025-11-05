const path = require('path');
const fileService = require('../fileService');

async function filesRoutes(fastify) {
  fastify.get('/api/files', async (request, reply) => {
    const { base = 'apps', path: targetPath = '.' } = request.query || {};

    try {
      const result = await fileService.listDirectory(targetPath, { base });
      return result;
    } catch (error) {
      fastify.log.error({ err: error, base, path: targetPath }, 'Error listing directory');
      reply.code(400);
      return { error: error.message };
    }
  });

  fastify.get('/api/files/content', async (request, reply) => {
    const { base = 'apps', path: targetPath } = request.query || {};

    if (!targetPath) {
      reply.code(400);
      return { error: 'path query parameter is required' };
    }

    try {
      const content = await fileService.readFile(targetPath, { base });
      return { content };
    } catch (error) {
      fastify.log.error({ err: error, base, path: targetPath }, 'Error reading file');
      reply.code(400);
      return { error: error.message };
    }
  });

  fastify.post('/api/files/content', async (request, reply) => {
    const { base = 'apps', path: targetPath, content } = request.body || {};

    if (!targetPath) {
      reply.code(400);
      return { error: 'path is required' };
    }

    if (content === undefined || content === null) {
      reply.code(400);
      return { error: 'content is required' };
    }

    try {
      await fileService.writeFile(targetPath, content, { base });
      return { success: true, path: targetPath };
    } catch (error) {
      fastify.log.error({ err: error, base, path: targetPath }, 'Error writing file');
      reply.code(400);
      return { error: error.message };
    }
  });

  fastify.post('/api/files/mkdir', async (request, reply) => {
    const { base = 'apps', path: targetPath } = request.body || {};

    if (!targetPath) {
      reply.code(400);
      return { error: 'path is required' };
    }

    try {
      await fileService.makeDirectory(targetPath, { base });
      return { success: true, path: targetPath };
    } catch (error) {
      fastify.log.error({ err: error, base, path: targetPath }, 'Error creating directory');
      reply.code(400);
      return { error: error.message };
    }
  });

  fastify.post('/api/files/rename', async (request, reply) => {
    const { base = 'apps', src, dest, overwrite = false } = request.body || {};

    if (!src) {
      reply.code(400);
      return { error: 'src is required' };
    }

    if (!dest) {
      reply.code(400);
      return { error: 'dest is required' };
    }

    try {
      await fileService.rename(src, dest, { base, overwrite });
      return { success: true, src, dest };
    } catch (error) {
      fastify.log.error({ err: error, base, src, dest }, 'Error renaming file/directory');
      reply.code(400);
      return { error: error.message };
    }
  });

  fastify.delete('/api/files', async (request, reply) => {
    const { base = 'apps', path: targetPath } = request.query || {};

    if (!targetPath) {
      reply.code(400);
      return { error: 'path query parameter is required' };
    }

    try {
      await fileService.remove(targetPath, { base });
      return { success: true, path: targetPath };
    } catch (error) {
      fastify.log.error({ err: error, base, path: targetPath }, 'Error deleting file/directory');
      reply.code(400);
      return { error: error.message };
    }
  });

  const upload = fileService.createUploadHandler({
    limits: { fileSize: 100 * 1024 * 1024 }
  });

  fastify.post('/api/files/upload', { preHandler: upload.single('file') }, async (request, reply) => {
    const { base = 'apps', path: targetPath = '.', strategy = 'replace', createFolder = false } = request.body || {};
    const file = request.file;

    if (!file) {
      reply.code(400);
      return { error: 'No file uploaded' };
    }

    try {
      const isZip = file.originalname.toLowerCase().endsWith('.zip');
      const destinationDir = fileService.resolveSafePath(targetPath, { base });

      if (isZip) {
        await fileService.extractArchive(file.buffer, targetPath, { base });
        return {
          success: true,
          type: 'zip',
          destination: targetPath,
          message: `Extracted ${file.originalname} to ${targetPath}`
        };
      }

      let finalDestination = destinationDir;
      let finalFileName = file.originalname;

      if (createFolder) {
        const folderName = path.basename(file.originalname, path.extname(file.originalname));
        const folderPath = path.join(targetPath, folderName);
        await fileService.makeDirectory(folderPath, { base });
        finalDestination = fileService.resolveSafePath(folderPath, { base });
      }

      const targetFilePath = path.join(path.relative(fileService.getBaseDirectory(base), finalDestination), finalFileName);
      const absoluteFilePath = fileService.resolveSafePath(targetFilePath, { base });

      const exists = await require('fs-extra').pathExists(absoluteFilePath);

      if (exists && strategy === 'skip') {
        return {
          success: false,
          skipped: true,
          message: `File ${finalFileName} already exists`
        };
      }

      if (exists && strategy === 'rename') {
        const ext = path.extname(finalFileName);
        const baseName = path.basename(finalFileName, ext);
        let counter = 1;
        let newName;
        let newPath;

        do {
          newName = `${baseName}-${counter}${ext}`;
          newPath = path.join(path.dirname(targetFilePath), newName);
          counter++;
        } while (await require('fs-extra').pathExists(fileService.resolveSafePath(newPath, { base })));

        finalFileName = newName;
        await fileService.writeFile(newPath, file.buffer, { base });

        return {
          success: true,
          type: 'file',
          renamed: true,
          path: newPath,
          message: `File saved as ${newName}`
        };
      }

      await fileService.writeFile(targetFilePath, file.buffer, { base });

      return {
        success: true,
        type: 'file',
        path: targetFilePath,
        message: `File ${finalFileName} uploaded successfully`
      };
    } catch (error) {
      fastify.log.error({ err: error, file: file.originalname, base, path: targetPath }, 'Error uploading file');
      reply.code(500);
      return { error: error.message };
    }
  });
}

module.exports = filesRoutes;
