import {InteractionHandler, InteractionHandlerTypes} from '@sapphire/framework';
import {ButtonInteraction, EmbedBuilder} from 'discord.js';
import {db} from "../db.js";
import {Card} from "../entities/card.js";
import { ItemService } from '../services/itemService.js';
import { DiscordUserService } from '../services/discordUserService.js';
import { EventLogService } from '../services/eventLogService.js';

//import {DiscordUserService} from "../services/discordUserService.js";


export class BurnHandler extends InteractionHandler {
    public constructor(ctx: InteractionHandler.LoaderContext, options: InteractionHandler.Options) {
        super(ctx, {
            ...options,
            interactionHandlerType: InteractionHandlerTypes.Button
        });
    }

    public override parse(interaction: ButtonInteraction) {
        if (interaction.customId.startsWith('burn:')) {
            const [confirm, id] = interaction.customId.split(':').slice(1)
            return this.some([confirm === 'confirm', id]);
        }

        return this.none();
    }

    public async run(interaction: ButtonInteraction, [confirm, id]: [boolean, string]) {
        const user = await DiscordUserService.findOrCreate(interaction.user)

        await db.transaction('SERIALIZABLE', async (tx) => {
            const card = await tx.getRepository(Card).findOne({
                where: {id, burned: false},
                relations: ['owner', 'condition', 'mapper'],
            })

            if (!card) {
                await interaction.reply({
                    content: 'Card not found',
                    ephemeral: true
                })
                return;
            }

            if (card.owner?.id !== interaction.user.id) {
                await interaction.reply({
                    content: 'You do not own this card!',
                    ephemeral: true
                });
                return;
            }

            if (!confirm) {
                await interaction.reply({
                    content: 'Burn has been cancelled',
                    ephemeral: true
                })
                await interaction.message.edit(
                    {
                        embeds: [
                            new EmbedBuilder()
                                .setTitle(interaction.message.embeds[0].title)
                                .setDescription(interaction.message.embeds[0].description)
                                .setThumbnail('attachment://card.png')
                                .setFooter({text: 'Burn has been cancelled'})
                                .setColor('Red')
                        ]
                    }
                )
                return;
            } else {
                const value = card.burnValue

                await tx.getRepository(Card).update(card.id, {
                    burned: true
                })

            
                try {


                await ItemService.changeItemCount(user, 'gold', value, tx)
                await ItemService.changeItemCount(user, card.dustType, card.dustValue, tx)

                EventLogService.logEvent(user, 'burn', {
                    card: {
                        id: card.id,
                        username: card.username,
                        burnValue: card.burnValue
                    }
                })

                await tx.getRepository(Card)
                    .update(card.id, {
                        burned: true
                    })

                } catch(e) {
                    console.error(e)
                    throw e
                }

                await interaction.reply({
                    content: `You have burned your card for ${value} gold!`,
                    ephemeral: true
                })

                await interaction.message.edit(
                    {
                        embeds: [
                            new EmbedBuilder()
                                .setTitle(interaction.message.embeds[0].title)
                                .setDescription(interaction.message.embeds[0].description)
                                .setThumbnail('attachment://card.png')
                                .setFooter({text: 'Card has been burned'})
                                .setColor('Green')
                        ],
                        components: []
                    }
                )
                return;
            }

        })
    }
}