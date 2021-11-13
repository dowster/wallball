package Game;

import Game.Game;
import java.awt.Graphics;
import java.awt.Point;
import java.net.URL;

public abstract class PowerUp {
   
   private final String name = "Generic Power-Up";   
   private final String desc = "Generic Description";
   public boolean running = false;
   public Point location;
   public Player player;
   public long startTime;
   public URL icon;
   public int effectTime = 2400;
   
   /*
   Gets the Power-Up's name text.
   */
   public String getName() {
      return this.name;
   }
   /*
   Gets the Power-Up's description text.
   */
   public String getDesc() {
      return this.desc;
   }
   /*
   Gets the Power-Up's name text.
   */
   public void pickup(Game g, Ball b) 
   {
      if(b.xVelocity > 0)
         player = g.playerOne;
      else
         player = g.playerTwo;
      
      init(g);
      startTime = g.timeElapsed;
      running = true;
   }

   /**
    * Runs the init of the given powerup. To handle any affects that may be
    * a one time change. 
    * @param game The current Game object.
    */
   public abstract void init(Game game);
   /**
    * Executes the Power-Up's unique method.
    * @param game The current Game object.
   */   
   public void tick(Game game)
   {
      if(running && ((game.timeElapsed - startTime) > effectTime))
      {
         this.end(game);
         game.activePowerup = null;
      }
   }
   
   /**
    * Runs the exit of the given powerup. To handle any affects that may be
    * a one time change. 
    * @param game The current Game object.
    */
   public abstract void end(Game game);
   
   /**
    * Draws the powerup either on the field or in the player's bar. 
    * @param game The current Game object.
    */
   public abstract void draw(Game game, Graphics w);
}
