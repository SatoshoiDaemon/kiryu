const { SlashCommandBuilder } = require('discord.js');
const { executeEdit } = require('./profile');

const data = new SlashCommandBuilder().setName('profile-edit').setDescription('Personalize seu cartão de perfil com pré-visualização.')
  .addAttachmentOption((option) => option.setName('image').setDescription('Envie uma imagem para armazenar no Blob e usar como fundo').setRequired(false));

module.exports = { data, execute: executeEdit, deferEphemeral: true };
