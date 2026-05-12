from dataclasses import dataclass

from app.services.item_generation_errors import ItemGenerationError


@dataclass(frozen=True)
class GeneratedItem:
    """Generated Bingo item data before it is persisted."""

    word: str
    description: str


MOUNTAIN_ITEMS = [
    GeneratedItem(
        word="Everest",
        description="The tallest mountain in the world, located in the Himalayas.",
    ),
    GeneratedItem(
        word="K2",
        description="The second-highest mountain on Earth and one of the hardest to climb.",
    ),
    GeneratedItem(
        word="Kilimanjaro",
        description="A free-standing volcanic mountain in Tanzania with snow-capped peaks.",
    ),
    GeneratedItem(
        word="Fuji",
        description="Japan's iconic volcanic mountain and a symbol of natural beauty.",
    ),
    GeneratedItem(
        word="Denali",
        description="The highest peak in North America, located in Alaska.",
    ),
    GeneratedItem(
        word="Matterhorn",
        description="A dramatic pyramid-shaped mountain in the Alps near Switzerland and Italy.",
    ),
    GeneratedItem(
        word="Mont Blanc",
        description="The tallest mountain in the Alps and Western Europe.",
    ),
    GeneratedItem(
        word="Aconcagua",
        description="The highest mountain in South America, found in Argentina.",
    ),
    GeneratedItem(
        word="Elbrus",
        description="A dormant volcano in the Caucasus and the highest peak in Europe.",
    ),
    GeneratedItem(
        word="Annapurna",
        description="A Himalayan mountain massif known for its challenging climbing routes.",
    ),
    GeneratedItem(
        word="Olympus",
        description="The legendary Greek mountain associated with the gods of mythology.",
    ),
    GeneratedItem(
        word="Rainier",
        description="A glacier-covered volcanic peak overlooking Washington state.",
    ),
    GeneratedItem(
        word="Pikes Peak",
        description="A Colorado mountain famous for inspiring the song America the Beautiful.",
    ),
    GeneratedItem(
        word="Mauna Kea",
        description="A Hawaiian volcano that is extremely tall when measured from its ocean base.",
    ),
    GeneratedItem(
        word="Table Mountain",
        description="A flat-topped landmark overlooking Cape Town in South Africa.",
    ),
    GeneratedItem(
        word="Eiger",
        description="A Swiss Alpine peak known for its imposing north face.",
    ),
    GeneratedItem(
        word="Vinson",
        description="The highest mountain in Antarctica.",
    ),
    GeneratedItem(
        word="Kosciuszko",
        description="The highest mountain on mainland Australia.",
    ),
    GeneratedItem(
        word="Whitney",
        description="The tallest mountain in the contiguous United States.",
    ),
    GeneratedItem(
        word="Shasta",
        description="A prominent volcanic peak in northern California.",
    ),
    GeneratedItem(
        word="Cook",
        description="New Zealand's tallest mountain, also known as Aoraki.",
    ),
    GeneratedItem(
        word="Logan",
        description="Canada's highest mountain, located in Yukon.",
    ),
    GeneratedItem(
        word="Jaya",
        description="A high peak in Papua, Indonesia, also called Puncak Jaya.",
    ),
    GeneratedItem(
        word="Nanga Parbat",
        description="A major Himalayan peak sometimes called the Killer Mountain.",
    ),
    GeneratedItem(
        word="Makalu",
        description="The fifth-highest mountain in the world, southeast of Everest.",
    ),
]


def generate_mock_items(topic: str, count: int) -> list[GeneratedItem]:
    """Generate mock Bingo items for a topic.

    This function is intentionally isolated from routes so a real LLM provider
    can replace the implementation later without changing API handlers.
    """
    display_topic = topic.strip() or "General Knowledge"
    normalized_topic = display_topic.lower()

    # Reserved topic for automated tests / manual failure simulation (no API keys).
    if normalized_topic == "__mock_generation_failure__":
        raise ItemGenerationError(
            "The mock item generator could not complete this request. "
            "Try a different topic or try again in a moment."
        )

    if normalized_topic == "famous mountains":
        base = list(MOUNTAIN_ITEMS)
        if count <= len(base):
            return base[:count]
        out = list(base)
        for i in range(len(base) + 1, count + 1):
            out.append(
                GeneratedItem(
                    word=f"Alpine pick {i}",
                    description=(
                        f"Mock pool filler #{i}: extra curated-style line so large "
                        f"pools work for automated tests without repeating real summit names."
                    ),
                )
            )
        return out

    return [
        GeneratedItem(
            word=f"{display_topic} Idea {index}",
            description=(
                f"A placeholder educational fact about {display_topic} "
                f"for Bingo item {index}."
            ),
        )
        for index in range(1, count + 1)
    ]
