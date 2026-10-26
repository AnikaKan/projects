import logging
import time


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s %(message)s")
    logging.getLogger(__name__).info("analysis worker shell started; analysis begins on Day 5")
    while True:
        time.sleep(60)


if __name__ == "__main__":
    main()
