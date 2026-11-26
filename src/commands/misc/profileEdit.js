const { SlashCommandBuilder } = require('discord.js');
const { executeEdit } = require('./profile');

const data = new SlashCommandBuilder().setName('profile-edit').setDescription('Personalize seu cartão de perfil com pré-visualização.');

module.exports = { data, execute: executeEdit, deferEphemeral: true };
