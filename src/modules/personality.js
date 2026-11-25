const lines = {
  daily: [
    'O cofre de hoje abriu antes que a poeira assentasse. Boa pontaria.',
    'Seu nome estava na lista do tesouro. A Kiryu conferiu duas vezes.',
    'Recompensa resgatada. Prometo que ninguém viu você negociar com o cofre.',
    'A fortuna de hoje veio parar nas mãos certas. Talvez.',
    'Mais um dia, mais um punhado de motivos para voltar amanhã.',
  ],
  levelUp: [
    'A Kiryu viu seu progresso e não deixou passar: mais um nível no Eternity.',
    'Seu esforço atravessou a próxima marca. A Kiryu já atualizou seu registro.',
    'Novo nível alcançado. Pode comemorar; a Kiryu já preparou o confete imaginário.',
    'O Eternity ficou um pouco maior com a sua evolução. Próxima parada: mais alto.',
  ],
  work: [
    'Turno encerrado: você segurou as pontas nos bastidores e saiu com a bolsa mais pesada.',
    'Serviço feito. A Kiryu anotou seu nome — desta vez na coluna dos pagamentos.',
    'Você encarou o expediente e venceu. O trabalho não teve a menor chance.',
    'A comunidade ganhou uma ajuda e você ganhou Fragmentos. Negócio justo.',
  ],
  transfer: [
    'A bolsa mudou de mãos sem derrubar um Fragmento pelo caminho.',
    'Transferência feita. A Kiryu registrou; a amizade agora é com vocês.',
    'Fragmentos enviados. Que sejam gastos com mais juízo do que a Kiryu teria.',
  ],
  purchase: [
    'Boa escolha. A Kiryu embrulhou a compra com um recibo e um olhar desconfiado.',
    'Negócio fechado. O item já segue para o destino configurado.',
    'A vitrine ficou mais vazia e seu inventário mais interessante.',
    'Compra registrada. A Kiryu jura que não estava tentando vender isso há dias.',
  ],
  casinoWin: [
    'A mesa piscou primeiro. Hoje a sorte está do seu lado.',
    'Acerto limpo. A Kiryu está tentando parecer surpresa.',
    'Vitória! Guarde esse momento antes que a mesa peça revanche.',
  ],
  casinoLoss: [
    'A mesa levou a rodada. A Kiryu recomenda respirar antes de tentar a revanche.',
    'Desta vez a sorte escolheu outra cadeira. A aposta foi registrada certinho.',
    'A casa ficou com a vantagem nesta rodada. O espetáculo continua quando você quiser.',
  ],
  casinoPush: [
    'Empate. A mesa não levou nada, você também não; a Kiryu chama isso de suspense bem administrado.',
    'A rodada ficou no zero a zero. Sua aposta voltou inteira para a carteira.',
  ],
  jackpot: [
    'JACKPOT! Até as luzes do salão pararam para olhar.',
    'Três símbolos, uma bolsa cheia. A Kiryu vai contar essa história como se tivesse previsto.',
  ],
  insufficient: [
    'Sua bolsa não alcança esse valor. A Kiryu conferiu: desta vez a matemática está do lado dela.',
    'Faltam Fragmentos para isso. O cofre está vazio antes da compra, não depois.',
  ],
  error: [
    'Algo saiu do trilho. A Kiryu guardou os detalhes para a equipe; tente mais uma vez daqui a pouco.',
    'Esta ação não fechou. Nenhuma confirmação de sucesso foi registrada.',
  ],
};

const previous = new Map();

function say(context, values = {}, random = Math.random) {
  const variants = lines[context] || lines.error;
  let index = Math.min(variants.length - 1, Math.floor(random() * variants.length));
  if (variants.length > 1 && previous.get(context) === index) index = (index + 1) % variants.length;
  previous.set(context, index);
  return variants[index].replace(/\{(\w+)\}/g, (_, key) => String(values[key] ?? ''));
}

function chooseOutcome(context, random = Math.random) {
  return say(context, {}, random);
}

module.exports = { lines, say, chooseOutcome };
