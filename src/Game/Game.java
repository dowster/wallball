package Game;

import Powerups.ExtraLife;
import Powerups.FastBall;
import Powerups.FastPaddle;
import Powerups.LargeBall;
import Powerups.LargePaddle;
import Powerups.MultiBall;
import Powerups.SlowBall;
import Powerups.SmallBall;
import Powerups.SmallPaddle;
import java.awt.CardLayout;
import java.awt.Color;
import java.awt.Container;
import java.awt.Dimension;
import java.awt.Font;
import java.awt.Graphics;
import java.awt.Image;
import java.awt.Point;
import java.awt.event.KeyEvent;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.text.AttributedCharacterIterator;
import java.util.ArrayList;
import java.util.Map;
import java.util.Random;
import java.util.Set;
import java.util.logging.Level;
import java.util.logging.Logger;
import javax.imageio.ImageIO;
import javax.swing.JPanel;

/**
 * WallBall mainclass
 * @author {Fancy}
 */
public class Game extends JPanel implements Runnable
{

   public static final boolean SINGLEPLAYER = true;
   public static final boolean TWO_PLAYER = false;

   public static final int EXTRA_LIFE = 1;
   public static final int FAST_BALL = 2;
   public static final int FAST_PADDLE = 3;
   public static final int LARGE_BALL = 4;
   public static final int LARGE_PADDLE = 5;
   public static final int MULTI_BALL = 6;
   public static final int SLOW_BALL = 7;
   public static final int SMALL_BALL = 8;
   public static final int SMALL_PADDLE = 9;
   
   private static final int BALL_INIT_SPEED_MULTIPLIER = 3;
   private final int BALL_INIT_SPEED_MIN = 4;   
   private final int FIELD_TOTAL_DIM = 510;
   private final int FIELD_NORMALIZER = 256;  
   
   private final int POWERUP_SPAWN_NORMALIZER = 150;
   private final int POWERUP_SPAWN_RANGE = 300;
   private final int PLAYER_TWO_ID = 2;
   private final int PLAYER_ONE_ID = 1;
   
   // Divisor is game speed in ticks per second
   private final double nsPerTick = 1000000000D / 30D;
   
   public static final int DEFAULT_WIDTH = 800, DEFAULT_HEIGHT = 600;

   private final int ENDGAME_FONT_SIZE = 36;
   private final String ENDGAME_FONT_NAME = "Agency FB";
   private final Font ENDGAME_FONT = new Font(ENDGAME_FONT_NAME, Font.CENTER_BASELINE, ENDGAME_FONT_SIZE);
   
   private final int ENDGAME_WAIT_TIME = 5000;
   
   private Thread gameThread;
   private boolean gameRunning = false;
   private Image dbImage;
   private Graphics window;

   private boolean singlePlayer;
   public Player playerOne;
   public Player playerTwo;

   private final int playerOneKeyDown = KeyEvent.VK_S;
   private final int playerOneKeyUp = KeyEvent.VK_W;
   private final int playerTwoKeyDown = KeyEvent.VK_DOWN;
   private final int playerTwoKeyUp = KeyEvent.VK_UP;
   private int timeToNewBall = 35; //seconds between a score and new ball spawn

   public ArrayList<Ball> balls = new ArrayList();
   public ArrayList<Ball> deadBalls = new ArrayList();

   private Color gameBackground = Color.black;
   private Color gameForeground = Color.white;

   private int gameBorderOffset = 25; //Offset in pixels
   public int ballSize = 20; //Size of each side of ball in pixels

   private boolean drawLine = true;
   private boolean drawBorder = true;
   private boolean drawBall = true;
   private boolean drawPlayerOne = true;
   private boolean drawPlayerTwo = true;
   PowerUp activePowerup = null;

   private int width = 0;
   private int height = 0;
   private int paddleZone = 20;
   private boolean drawPaddleZone = true;
   public static long timeElapsed = 0;
   private long lastTimeChecked = 0;
   protected long powerUpTime = 0;

   private boolean drawPowerUp = true;
   BufferedImage heart;
   
   private Container contentPane;

   public Game()
   {
   }
   /**
   Constructor which sets up the critical variables and calls the setup function
   @param singlePlayer true if single player, false if not
   @param contentPane jFrame window
   */
   public Game(boolean singlePlayer, Container contentPane)
   {
      this.singlePlayer = singlePlayer;
      this.contentPane = contentPane;
      setPreferredSize(new Dimension(500, POWERUP_SPAWN_RANGE));
      setBackground(gameBackground);
      setFocusable(true);
      requestFocus();
      setup();
   }
   /**
   Main loop for the game.
   */
   public void run()
   {

      long lastTime = System.nanoTime();

      int ticks = 0;
      int frames = 0;

      long lastTimer = System.currentTimeMillis();
      double delta = 0;

      while (gameRunning)
      {
         long now = System.nanoTime();
         delta += (now - lastTime) / nsPerTick;
         lastTime = now;
         boolean shouldRender = true;

         while (delta >= 1)
         {
            ticks++;
            gameUpdate();
            delta -= 1;
            shouldRender = true;
         }

         try
         {
            Thread.sleep(10);
         }
         catch (InterruptedException e)
         {
            e.printStackTrace();
         }

         if (shouldRender)
         {
            frames++;
            gameRender();
            paintScreen();
            timeElapsed += 1;
         }

         if (System.currentTimeMillis() - lastTimer >= 1000)
         {
            lastTimer += 1000;
            frames = 0;
            ticks = 0;
         }
      }
      
      gameRender();
      
      try
      {
         Thread.sleep(ENDGAME_WAIT_TIME);
      }
      catch (InterruptedException ex)
      {
         Logger.getLogger(Game.class.getName()).log(Level.SEVERE, null, ex);
      }
      CardLayout cl = (CardLayout)contentPane.getLayout();
      cl.show(contentPane, "menu");
   }

   /**
   Runs as soon as this JPanel is added to the JFramme
   Later on we can change it so its when the menu button start is pressed
   Or something similar to start the game.
   */
   public void addNotify()
   {
      super.addNotify();
      startGame();
   }
   /**
   starts the game execution
   */
   private void startGame()
   {
      if (gameThread == null)
      {
         gameThread = new Thread(this);
         gameThread.start();
         gameRunning = true;
      }
   }
   /**
   stops the game execution
   */
   public void stopGame()
   {
      if (gameRunning)
      {
         gameRunning = false;
      }
   }
   /**
   Gets the closest ball to the player;
   @param id id of the player
   @param x point x
   @param y point y
   @return the closest ball
   */
   public Ball getClosestBall(int id, int x, int y)
   {
      float low = 1000000; // number will never get above 255 but just because
      Ball temp = new Ball(1, 0);
      for (Ball t : balls)
      {
         float dist = getDistance(t.location.x, t.location.y, x, y);
         if (dist < low)
         {
            temp = t;
            low = dist;
         }
      }
      return temp;
   }
   /**
   Standard distance formula.
   @param x x1
   @param y y1
   @param x2 x2
   @param y2 y2
   @return 
   */
   public float getDistance(float x, float y, float x2, float y2)
   {
      return (float) Math.sqrt(
            Math.abs(Math.pow(x, 2) - Math.pow(x2, 2))
            + Math.abs(Math.pow(y, 2) - Math.pow(y2, 2))
      );
   }
   /**
   Ticks all the game entities.
   */
   public void gameUpdate()
   {
      if (gameRunning)
      {
         playerOne.tick(this);
         playerTwo.tick(this);
         for (Ball ball : balls) // loops through all balls and ticks
         {
            ball.tick(this);
         }
         if (deadBalls.size() > 0) //if a ball hits a side run this
         {
            ballHitSide();
         }
         if (
               lastTimeChecked + timeToNewBall < 
               timeElapsed && balls.size() < 1) //Handles balls delayed spawning
         {
            addBall();
         }
         if (activePowerup != null)
         {
            if (activePowerup.running)
            {
               if (activePowerup.startTime - timeElapsed > powerUpTime)
               {
                  activePowerup.end(this);
                  activePowerup = null;
               }
               else
               {
                  activePowerup.tick(this);
               }
            }
            else
            {
               checkPowerUpHit();
            }
         }
         if(playerOne.getPlayerLives() <= 0 || 
               playerTwo.getPlayerLives() <= 0)
            stopGame();
      }
   }
   /**
   Checks if a ball has hit the powerup.
   */
   private void checkPowerUpHit()
   {
      if (activePowerup != null)
      {
         for (Ball b : balls)
         {
            if (activePowerup.location.distance(b.location) < ballSize)
            {
               activePowerup.pickup(this, b);
            }
         }
      }
   }
   /**
   Calculates which side the ball hit on.
   */
   private void ballHitSide()
   {
      for (Ball ball : deadBalls)
      {
         balls.remove(ball);
      }
      deadBalls.clear();

      lastTimeChecked = timeElapsed;
   }

   /**
   Draws all the game elements.
   @param window window on which to draw the elements
   */
   private void draw(Graphics window)
   {

      window.setColor(gameForeground);
      //window.drawString("Hello World!", 100, 100);
      drawLives();

      if (drawLine)
      {
         drawLine(window);
      }
      if (drawPlayerOne)
      {
         drawPlayerOne(window);
      }
      if (drawPlayerTwo)
      {
         drawPlayerTwo(window);
      }
      if (drawBorder)
      {
         drawBorder(window);
      }

      if (drawPaddleZone)
      {
         drawPaddleZone(window);
      }

      if (drawPowerUp)
      {
         if (activePowerup != null)
         {
            if (activePowerup.running)
            {
               activePowerup.draw(this, window);
            }
            else
            {
               drawPowerup(window);
            }
         }
      }
      if (drawBall)
      {
         drawBall(window);
      }
      
      if(!gameRunning)
      {
         DrawEndgame(window);
      }

   }
   /**
   Converts a logical point location to corresponding pixel coordinates on 
   the game screen.
   @param loc logical game location
   @return pixel coordinates on screen
   */
   private Point ConvertLocToDraw(Point loc)
   {
      int convertedX = 
            paddleZone + (int) ((((float) loc.x) + FIELD_NORMALIZER) / 
            FIELD_TOTAL_DIM * (this.getFieldWidth() - paddleZone * 2));
      int convertedY = 
            (int) ((((float) -loc.y) + FIELD_NORMALIZER) / 
            FIELD_TOTAL_DIM * this.getFieldHeight());

      return new Point(convertedX, convertedY);
   }
   /**
   Draws the active powerup if it hasn't been picked up yet
   @param g window on which to draw
   */
   private void drawPowerup(Graphics g)
   {
      if (activePowerup.startTime < timeElapsed)
      {
         try
         {
            Point draw = ConvertLocToDraw(activePowerup.location);
            g.drawImage(
                  ImageIO.read(activePowerup.icon), 
                  draw.x, 
                  draw.y, 
                  this);
         }
         catch (IOException ex)
         {
            System.out.println(ex);
         }
      }
   }
   /**
   Paints the background on the screen
   */
   private void paintScreen()
   {
      Graphics g;
      try
      {
         g = this.getGraphics();
         if (dbImage != null)
         {
            g.drawImage(dbImage, 0, 0, null);
         }
         g.dispose();
      }
      catch (Exception e)
      {
         System.out.print(e);
      }
   }

   /**
   Ensures there is a graphics object and then calls draw.
   */
   public void gameRender()
   {

      if (getWidth() != width || getHeight() != height)
      {
         width = getWidth();
         height = getHeight();
         dbImage = createImage(getWidth(), getHeight());
      }
      if (dbImage != null)
      {
         window = dbImage.getGraphics();
         //clears the games screen
         window.setColor(gameBackground);
         if (getWidth() > 0 && getHeight() > 0)
         {
            window.fillRect(0, 0, getWidth(), getWidth());
         }
         else
         {
            window.fillRect(0, 0, DEFAULT_WIDTH, DEFAULT_HEIGHT);
         }

         //draws the game stuff
         draw(window);
      }
   }
   /**
   Adds a ball with a random trajectory to the game.
   */
   public void addBall()
   {
      //randomly set the direction of the ball
      int xMod = (Math.rint(Math.random() * 2) == 1) ? 1 : -1;
      int yMod = (Math.rint(Math.random() * 2) == 1) ? 1 : -1;

      Ball ball = new Ball(
            xMod * (Math.random() * 
                  BALL_INIT_SPEED_MULTIPLIER + BALL_INIT_SPEED_MIN), 
            yMod * (Math.random() * BALL_INIT_SPEED_MIN));
      balls.add(ball);
   }
   /**
   Generates a random power up at a random location within POWERUP_SPAWN_RANGE
   */
   public void generatePowerup()
   {
      if (activePowerup == null)
      {
         int powerUpID = (int) (Math.random() * 9 + 1);
         Point spawn = new Point((int) 
               (Math.random()*POWERUP_SPAWN_RANGE - POWERUP_SPAWN_NORMALIZER),
               (int)(Math.random()*
                     POWERUP_SPAWN_RANGE - POWERUP_SPAWN_NORMALIZER));

         switch (powerUpID)
         {
            case EXTRA_LIFE:
               activePowerup = new ExtraLife(spawn);
               break;
            case FAST_BALL:
               activePowerup = new FastBall(spawn);
               break;
            case FAST_PADDLE:
               activePowerup = new FastPaddle(spawn);
               break;
            case LARGE_BALL:
               activePowerup = new LargeBall(spawn);
               break;
            case LARGE_PADDLE:
               activePowerup = new LargePaddle(spawn);
               break;
            //case MULTI_BALL:
               //activePowerup = new MultiBall(spawn);
               //break;
            case SMALL_BALL:
               activePowerup = new SmallBall(spawn);
               break;
            case SLOW_BALL:
               activePowerup = new SlowBall(spawn);
               break;
            case SMALL_PADDLE:
               activePowerup = new SmallPaddle(spawn);
               break;
         }
      }
   }
   /**
   Sets up the variables used for the game.
   */
   public void setup()
   {

      playerOne = new HumanPlayer(PLAYER_ONE_ID, playerOneKeyDown, playerOneKeyUp, this);
      //playerOne = new CPUPlayer(1);
      if (singlePlayer)
      {
         playerTwo = new CPUPlayer(PLAYER_TWO_ID);
      }
      else
      {
         playerTwo = new HumanPlayer(
               PLAYER_TWO_ID, playerTwoKeyDown, playerTwoKeyUp, this);
      }
      //Caches the heart image
      try
      {
         heart = ImageIO.read(Game.class.getResource("/Resources/Heart.png"));
      }
      catch (Exception e)
      {
         System.out.println(e);
      }
      
      addBall();
   }

   /**
   Draws the paddle and points for player one
   @param window the window on which to draw
   */
   private void drawPlayerOne(Graphics window)
   {
      int fieldHeight = this.getFieldHeight();
      int adjustedPaddleHeight = (int) ((float) playerOne.paddleHeight / FIELD_TOTAL_DIM * fieldHeight);
      int topOfPaddle = convertPaddleLocation(playerOne.paddleLocation, fieldHeight, adjustedPaddleHeight);
      window.fillRect(gameBorderOffset + 5, gameBorderOffset + topOfPaddle, playerOne.paddleThickness, adjustedPaddleHeight);
      window.drawString(Integer.toString(playerOne.getPoints()), getWidth() / 2 - 30, 20);
   }
   /**
   Draws the paddle and points for player two
   @param window the window on which to draw
   */
   private void drawPlayerTwo(Graphics window)
   {
      int fieldHeight = this.getFieldHeight();
      int adjustedPaddleHeight = (int) ((float) playerTwo.paddleHeight / FIELD_TOTAL_DIM * fieldHeight);
      int topOfPaddle = convertPaddleLocation(playerTwo.paddleLocation, fieldHeight, adjustedPaddleHeight);
      window.fillRect(this.getWidth() - gameBorderOffset - playerTwo.paddleThickness - 5, gameBorderOffset + topOfPaddle, playerTwo.paddleThickness, adjustedPaddleHeight);
      window.drawString(Integer.toString(playerTwo.getPoints()), getWidth() / 2 + 25, 20);
   }
   /**
   Draws the life hearts on either side of the screen.
   */
   private void drawLives()
   {
      for (int i = playerOne.getPlayerLives(); i > 0; i--)
      {
         window.drawImage(heart, 0, i * 40, 25, 25, this);
      }
      for (int i = playerTwo.getPlayerLives(); i > 0; i--)
      {
         window.drawImage(heart, getWidth() - 25, i * 40, 25, 25, this);
      }
   }
   /**
   Draws all the balls currently active in the game
   @param window The window on which to draw the ball
   */
   private void drawBall(Graphics window)
   {
      for (Ball ball : balls)
      {
         Point draw = ConvertLocToDraw(ball.location);

         window.fillRect(
               draw.x + gameBorderOffset - ballSize / 2, 
               draw.y + gameBorderOffset - ballSize / 2, ballSize, ballSize);
      }
   }

   /**
    Draws a white border around the game window

    @param window the window of which to draw the border
    */
   private void drawBorder(Graphics window)
   {
      window.drawRect(
            gameBorderOffset,
            gameBorderOffset,
            this.getWidth() - gameBorderOffset * 2,
            this.getHeight() - gameBorderOffset * 2);
   }
   /**
   Draws the games center line
   
   @param window the window on which to draw the line
   */
   private void drawLine(Graphics window)
   {
      window.drawLine(this.getWidth() / 2, gameBorderOffset,
            this.getWidth() / 2, this.getHeight() - gameBorderOffset);
   }

   /**
    Processes a ball hitting the left or right boundary

    @param leftSide true if on left side, false if on right
    */
   public void processHit(boolean leftSide, int height, Ball ball)
   {
      if (leftSide
            && playerOne.paddleLocation + playerOne.paddleHeight / 2 > height
            && playerOne.paddleLocation - playerOne.paddleHeight / 2 < height)
      {
         playerOne.addPoint();
         ball.yVelocity = calculateBallDeflection(playerOne, ball);
         generatePowerup();
      }
      else if (leftSide)
      {
         playerOne.decLife();
         deadBalls.add(ball);
      }

      if (!leftSide
            && playerTwo.paddleLocation + playerTwo.paddleHeight / 2 > height
            && playerTwo.paddleLocation - playerTwo.paddleHeight / 2 < height)
      {
         playerTwo.addPoint();
         ball.yVelocity = calculateBallDeflection(playerTwo, ball);
               
         generatePowerup();
      }
      else if (!leftSide)
      {
         playerTwo.decLife();
         deadBalls.add(ball);
      }
   }
   /**
   Calculates ball deflection y velocity based on where it hit the paddle.
   @param player player who's paddle hit the ball
   @param ball ball that hit the paddle
   @return ball's new y velocity
   */
   private int calculateBallDeflection(Player player, Ball ball)
   {
      return (int) ((float) (ball.location.y - player.paddleLocation) / 
            player.paddleHeight * ball.maxYVelocity);
   }
   
   /**
   Calculates the field height based off window size
   @return field height in pixels
   */
   public int getFieldHeight()
   {
      return this.getHeight() - (gameBorderOffset * 2);
   }
   /**
   Calculates the field width based off window size
   @return field width in pixels
   */
   public int getFieldWidth()
   {
      return this.getWidth() - (gameBorderOffset * 2);
   }
   /**
   Draws the yellow borders near the paddle zones
   @param window The window to draw onto
   */
   private void drawPaddleZone(Graphics window)
   {
      int drawX = gameBorderOffset + paddleZone;
      int drawWidth = 5;
      window.setColor(Color.YELLOW);
      //Left Line
      window.drawLine(drawX, gameBorderOffset,
            drawX, this.getHeight() - gameBorderOffset);
      //Right Line
      window.drawLine(getWidth() - drawX - drawWidth, gameBorderOffset,
            getWidth() - drawX - drawWidth, this.getHeight() - gameBorderOffset);
      window.setColor(gameForeground);
   }
   /**
   Converts the paddle from a logical location to the drawing location
   @param paddleLocation Paddle logical location
   @param fieldHeight Field height in window
   @param adjustedPaddleHeight Paddle height adjusted for field
   @return 
   */
   private int convertPaddleLocation(
         int paddleLocation, int fieldHeight, int adjustedPaddleHeight)
   {
      return (int) 
         ((((float) -paddleLocation + (float) FIELD_NORMALIZER) / 
         (float) FIELD_TOTAL_DIM) * fieldHeight - adjustedPaddleHeight / 2);
   }
   /**
   Draws the endgame box.
   @param g Graphics object to draw to.
   */
   private void DrawEndgame(Graphics g)
   {
      int endgameOffset = 75;
      int endgameWidth = 225;
      int endgameHeight = 75;
      
      String winMessage;
      g.fillRect(
            getWidth() / 2 - endgameWidth / 2, 
            getHeight() / 2 - endgameHeight / 2, 
            endgameWidth, 
            endgameHeight);
      
      if(singlePlayer)
      {
         if(playerOne.getPlayerLives() > 0)
            winMessage = "YOU WIN!!!!";
         else
            winMessage = "YOU LOSE!";
      }
      else
      {
         endgameOffset += 25;
         if(playerOne.getPlayerLives() > 0)
            winMessage = "PLAYER 1 WINS!";
         else
            winMessage = "PLAYER 2 WINS!";
      }
      
      g.setFont(ENDGAME_FONT);
      g.setColor(gameBackground);
      
      g.drawString(
            winMessage, 
            getWidth() / 2 - endgameOffset, 
            getHeight() / 2);
   }
}
